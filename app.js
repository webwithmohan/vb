// ==========================================================
// 1. FIREBASE SETUP  -  paste your own config here
//    Firebase Console > Project settings > Your apps > Web app
// ==========================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc,
  onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

 const firebaseConfig = {
    apiKey: "AIzaSyCM74i3-2CkJVIl9atdyNt3vJWyXfpj-FQ",
    authDomain: "vocabulary-a9d5f.firebaseapp.com",
    projectId: "vocabulary-a9d5f",
    storageBucket: "vocabulary-a9d5f.firebasestorage.app",
    messagingSenderId: "1062692267960",
    appId: "1:1062692267960:web:53be929f4d223f9257914d",
    measurementId: "G-KW26RHBZZ6"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();
const wordsRef = collection(db, "words");

// ==========================================================
// 2. ELEMENTS + STATE
// ==========================================================
const $ = (id) => document.getElementById(id);

const el = {
  adminPanel: $("adminPanel"), adminBadge: $("adminBadge"),
  loginBtn: $("loginBtn"), logoutBtn: $("logoutBtn"),
  loginDialog: $("loginDialog"), loginForm: $("loginForm"),
  loginClose: $("loginClose"), loginError: $("loginError"),
  lEmail: $("lEmail"), lPass: $("lPass"),
  form: $("wordForm"), formTitle: $("formTitle"),
  fWord: $("fWord"), fPos: $("fPos"), fMeaning: $("fMeaning"), fExample: $("fExample"),
  saveBtn: $("saveBtn"), cancelBtn: $("cancelBtn"),
  search: $("search"), letters: $("letters"),
  list: $("list"), count: $("count"), empty: $("empty"), toast: $("toast")
};

let allWords = [];      // every word from Firestore
let isAdmin = false;    // true after admin logs in
let editingId = null;   // id of the word being edited
let activeLetter = "";  // current A-Z filter

// ==========================================================
// 3. ADMIN LOGIN / LOGOUT
// ==========================================================
el.loginBtn.addEventListener("click", () => {
  el.loginError.hidden = true;
  el.loginDialog.showModal();
});
el.loginClose.addEventListener("click", () => el.loginDialog.close());

el.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await signInWithEmailAndPassword(auth, el.lEmail.value.trim(), el.lPass.value);
    el.loginForm.reset();
    el.loginDialog.close();
    toast("Logged in");
  } catch (err) {
    el.loginError.textContent = "Wrong email or password.";
    el.loginError.hidden = false;
  }
});

el.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  toast("Logged out");
});

onAuthStateChanged(auth, (user) => {
  isAdmin = !!user;
  el.adminPanel.hidden = !isAdmin;
  el.adminBadge.hidden = !isAdmin;
  el.logoutBtn.hidden = !isAdmin;
  el.loginBtn.hidden = isAdmin;
  if (!isAdmin) resetForm();
  render();
});

// ==========================================================
// 4. READ  -  live updates from Firestore (everyone can view)
// ==========================================================
const q = query(wordsRef, orderBy("wordLower"));
onSnapshot(q, (snap) => {
  allWords = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
}, (err) => {
  console.error(err);
  toast("Could not load words. Check your Firebase config and rules.");
});

// ==========================================================
// 5. CREATE + UPDATE  (admin only)
// ==========================================================
el.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!isAdmin) return;

  const word = el.fWord.value.trim();
  const data = {
    word,
    wordLower: word.toLowerCase(),
    pos: el.fPos.value,
    meaning: el.fMeaning.value.trim(),
    example: el.fExample.value.trim()
  };

  try {
    if (editingId) {
      await updateDoc(doc(db, "words", editingId), data);
      toast("Changes saved");
    } else {
      await addDoc(wordsRef, { ...data, createdAt: serverTimestamp() });
      toast("Word added");
    }
    resetForm();
  } catch (err) {
    console.error(err);
    toast("Could not save. Are you logged in as admin?");
  }
});

function startEdit(w) {
  editingId = w.id;
  el.fWord.value = w.word;
  el.fPos.value = w.pos || "noun";
  el.fMeaning.value = w.meaning;
  el.fExample.value = w.example || "";
  el.formTitle.textContent = "Edit word";
  el.saveBtn.textContent = "Save changes";
  el.cancelBtn.hidden = false;
  el.adminPanel.scrollIntoView({ behavior: "smooth" });
  el.fWord.focus();
}

function resetForm() {
  editingId = null;
  el.form.reset();
  el.formTitle.textContent = "Add a new word";
  el.saveBtn.textContent = "Add word";
  el.cancelBtn.hidden = true;
}
el.cancelBtn.addEventListener("click", resetForm);

// ==========================================================
// 6. DELETE  (admin only)
// ==========================================================
async function removeWord(w) {
  if (!isAdmin) return;
  if (!confirm(`Delete "${w.word}"? This cannot be undone.`)) return;
  try {
    await deleteDoc(doc(db, "words", w.id));
    if (editingId === w.id) resetForm();
    toast("Word deleted");
  } catch (err) {
    console.error(err);
    toast("Could not delete. Are you logged in as admin?");
  }
}

// ==========================================================
// 7. SEARCH + A-Z FILTER + RENDER
// ==========================================================
el.search.addEventListener("input", render);

function buildLetters() {
  el.letters.innerHTML = "";
  const make = (label, value) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "letter";
    b.textContent = label;
    b.setAttribute("aria-pressed", String(activeLetter === value));
    b.addEventListener("click", () => {
      activeLetter = value;
      render();
    });
    el.letters.appendChild(b);
  };
  make("All", "");
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((l) => make(l, l));
}

function highlight(text, term) {
  const frag = document.createDocumentFragment();
  if (!term) { frag.append(text); return frag; }
  const lower = text.toLowerCase();
  let i = 0, pos;
  while ((pos = lower.indexOf(term, i)) !== -1) {
    frag.append(text.slice(i, pos));
    const m = document.createElement("mark");
    m.textContent = text.slice(pos, pos + term.length);
    frag.append(m);
    i = pos + term.length;
  }
  frag.append(text.slice(i));
  return frag;
}

function render() {
  buildLetters();
  const term = el.search.value.trim().toLowerCase();

  const shown = allWords.filter((w) => {
    const matchLetter = !activeLetter || w.wordLower.startsWith(activeLetter.toLowerCase());
    const matchTerm = !term || w.wordLower.includes(term) || (w.meaning || "").toLowerCase().includes(term);
    return matchLetter && matchTerm;
  });

  el.list.innerHTML = "";
  el.count.textContent = `${shown.length} of ${allWords.length} words`;
  el.empty.hidden = shown.length > 0;

  shown.forEach((w) => {
    const card = document.createElement("article");
    card.className = "card";

    const head = document.createElement("div");
    head.className = "card-head";
    const h = document.createElement("h3");
    h.className = "word";
    h.append(highlight(w.word, term));
    const pos = document.createElement("span");
    pos.className = "pos";
    pos.textContent = w.pos || "";
    head.append(h, pos);

    const meaning = document.createElement("p");
    meaning.className = "meaning";
    meaning.append(highlight(w.meaning || "", term));

    card.append(head, meaning);

    if (w.example) {
      const ex = document.createElement("p");
      ex.className = "example";
      ex.textContent = w.example;
      card.append(ex);
    }

    if (isAdmin) {
      const actions = document.createElement("div");
      actions.className = "card-actions";
      const edit = document.createElement("button");
      edit.className = "btn ghost small";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => startEdit(w));
      const del = document.createElement("button");
      del.className = "btn danger small";
      del.textContent = "Delete";
      del.addEventListener("click", () => removeWord(w));
      actions.append(edit, del);
      card.append(actions);
    }

    el.list.append(card);
  });
}

// ==========================================================
// 8. TOAST
// ==========================================================
let toastTimer;
function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2400);
}

render();
