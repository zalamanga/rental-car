import { STORAGE_KEY, MAX_DAYS, MAX_QUANTITY, validateCatalogue, validAmount, decodeCart, encodeCart, addCar, calculateQuote, filterCars, quoteText } from './cart.js';

const page = document.body.dataset.page;
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
let catalogue = [];
let items = [];
let loadActive = false;
let toastTimer;
let storageUnavailable = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function notify(text) {
  const target = document.getElementById('notification');
  target.textContent = text;
  target.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { target.hidden = true; }, 5000);
}

function notice(text) {
  const target = document.getElementById('storage-notice');
  if (target) { target.textContent = text; target.hidden = false; }
  else notify(text);
}

function readItems(raw) {
  const saved = decodeCart(raw, catalogue);
  items = saved.items;
  if (saved.recovered) notice('Sebagian data keranjang tidak valid. Mobil yang masih valid dipertahankan; pilih ulang item yang hilang.');
  updateCount();
}

function saveItems() {
  try { localStorage.setItem(STORAGE_KEY, encodeCart(items)); }
  catch {
    storageUnavailable = true;
    notice('Penyimpanan browser tidak tersedia. Perubahan hanya berlaku di tab ini dan dapat hilang saat berpindah halaman. Unduh ringkasan sebelum menutupnya.');
  }
  updateCount();
}

function updateCount() {
  for (const count of document.querySelectorAll('[data-cart-count]')) count.textContent = String(items.length);
}

function image(car, className) {
  const element = node('img', undefined, className);
  element.src = car.image;
  element.alt = car.name;
  element.width = 440;
  element.height = 240;
  element.loading = 'lazy';
  element.addEventListener('error', () => {
    element.hidden = true;
    element.after(node('p', `Foto ${car.name} belum dapat dimuat.`, 'fine-print'));
  }, { once: true });
  return element;
}

function renderCatalogue() {
  const rows = filterCars(catalogue, {
    search: document.getElementById('search').value,
    category: document.getElementById('category').value,
    sort: document.getElementById('sort').value,
  });
  const grid = document.getElementById('cars');
  grid.replaceChildren();
  for (const car of rows) {
    const article = node('article', undefined, 'car');
    const details = node('div', undefined, 'car-details');
    details.append(node('p', `${car.category.toUpperCase()} · ${car.color}`, 'category'), node('h2', car.name));
    const price = node('p', money(car.dailyPrice) + ' ', 'price');
    price.append(node('small', '/ hari'));
    const selected = items.some((item) => item.id === car.id);
    let action;
    if (selected) {
      action = node('a', 'Lihat di keranjang', 'button secondary');
      action.href = 'cart.html';
    } else {
      action = node('button', 'Pilih mobil', 'button primary');
      action.type = 'button';
      action.setAttribute('aria-label', `Pilih ${car.name}`);
      action.addEventListener('click', () => {
        items = addCar(items, car.id).items;
        saveItems();
        renderCatalogue();
        notify(`${car.name} ditambahkan. Atur hari dan unit di keranjang.`);
        const current = [...grid.querySelectorAll('h2')].find((heading) => heading.textContent === car.name);
        current?.parentElement.querySelector('a')?.focus();
      });
    }
    details.append(price, action);
    article.append(image(car, 'car-photo'), details);
    grid.append(article);
  }
  grid.setAttribute('aria-busy', 'false');
  document.getElementById('result-count').textContent = `${rows.length} mobil ditampilkan dari ${catalogue.length} pilihan.`;
  const empty = document.getElementById('empty-results');
  empty.hidden = rows.length !== 0;
  empty.querySelector('h2').textContent = catalogue.length ? 'Tidak ada mobil yang cocok.' : 'Belum ada pilihan mobil.';
  empty.querySelector('p').textContent = catalogue.length ? 'Ubah kata pencarian atau reset filter untuk melihat pilihan lain.' : 'Katalog saat ini kosong. Coba buka kembali nanti.';
}

function updateSummary() {
  const quote = calculateQuote(items, catalogue);
  document.getElementById('subtotal').textContent = money(quote.subtotal);
  document.getElementById('fee').textContent = money(quote.serviceFee);
  document.getElementById('total').textContent = money(quote.total);
  const invalid = [...document.querySelectorAll('#cart-items input')].some((field) => !field.checkValidity());
  document.getElementById('download').disabled = invalid;
  const message = document.getElementById('validation-message');
  message.hidden = !invalid;
  message.textContent = invalid ? 'Perbaiki isian hari atau unit. Angka estimasi masih memakai nilai valid terakhir.' : '';
  for (const row of quote.rows) document.getElementById(`subtotal-${row.id}`).textContent = money(row.subtotal);
}

function amountField(car, item, property, label, maximum) {
  const wrapper = node('label', label);
  const input = node('input');
  input.type = 'number';
  input.min = '1';
  input.max = String(maximum);
  input.step = '1';
  input.required = true;
  input.value = String(item[property]);
  input.setAttribute('aria-label', `${label} ${car.name}`);
  const errorId = `error-${car.id}`;
  input.setAttribute('aria-describedby', errorId);
  input.addEventListener('input', () => {
    const value = validAmount(input.value, maximum);
    input.setCustomValidity(value === null ? `${label} harus bilangan bulat 1 sampai ${maximum}.` : '');
    input.setAttribute('aria-invalid', value === null ? 'true' : 'false');
    const error = document.getElementById(errorId);
    if (value !== null) { item[property] = value; saveItems(); }
    const rowInputs = [...input.closest('.cart-row').querySelectorAll('input')];
    const invalid = rowInputs.find((field) => !field.checkValidity());
    error.textContent = invalid ? invalid.validationMessage : '';
    error.hidden = !invalid;
    updateSummary();
  });
  wrapper.append(input);
  return wrapper;
}

function renderCart() {
  const empty = items.length === 0;
  document.getElementById('empty-cart').hidden = !empty;
  document.getElementById('quote-layout').hidden = empty;
  document.getElementById('result-count').textContent = empty ? 'Keranjang kosong.' : `${items.length} jenis mobil dipilih. Maksimal 365 hari dan 10 unit per jenis.`;
  const list = document.getElementById('cart-items');
  list.replaceChildren();
  for (const item of items) {
    const car = catalogue.find((entry) => entry.id === item.id);
    const row = node('article', undefined, 'cart-row');
    const detail = node('div');
    detail.append(node('h2', car.name), node('p', `${money(car.dailyPrice)} / hari / unit`, 'daily-price'));
    const controls = node('div', undefined, 'cart-controls');
    controls.append(amountField(car, item, 'days', 'Hari', MAX_DAYS), amountField(car, item, 'quantity', 'Unit', MAX_QUANTITY));
    const subtotal = node('p', undefined, 'row-subtotal');
    subtotal.id = `subtotal-${car.id}`;
    const error = node('p', '', 'field-error');
    error.id = `error-${car.id}`;
    error.hidden = true;
    error.setAttribute('role', 'status');
    const remove = node('button', 'Hapus mobil', 'remove');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Hapus ${car.name}`);
    remove.addEventListener('click', () => {
      const index = items.findIndex((entry) => entry.id === item.id);
      items = items.filter((entry) => entry.id !== item.id);
      saveItems();
      renderCart();
      notify(`${car.name} dihapus dari estimasi.`);
      const remaining = list.querySelectorAll('.remove');
      if (remaining.length) remaining[Math.min(index, remaining.length - 1)].focus();
      else document.querySelector('#empty-cart a').focus();
    });
    detail.append(controls, error, subtotal, remove);
    row.append(image(car, ''), detail);
    list.append(row);
  }
  list.setAttribute('aria-busy', 'false');
  if (!empty) updateSummary();
}

async function load() {
  if (loadActive) return;
  loadActive = true;
  const error = document.getElementById('load-error');
  const retry = document.getElementById('retry');
  const status = document.getElementById('result-count');
  if (error) error.hidden = true;
  if (retry) retry.disabled = true;
  if (status) status.textContent = 'Memuat katalog mobil…';
  document.getElementById('cars')?.setAttribute('aria-busy', 'true');
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 6000);
  try {
    const response = await fetch('data.json', { signal: abort.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Catalogue unavailable');
    catalogue = validateCatalogue(await response.json());
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); }
    catch { storageUnavailable = true; notice('Penyimpanan browser tidak tersedia. Keranjang hanya berlaku sementara di tab ini.'); }
    if (!storageUnavailable) readItems(raw);
    if (page === 'catalogue') renderCatalogue();
    if (page === 'cart') renderCart();
  } catch {
    if (error) error.hidden = false;
    if (status) status.textContent = 'Katalog belum tersedia.';
    document.getElementById('cars')?.replaceChildren();
    const quote = document.getElementById('quote-layout');
    if (quote) quote.hidden = true;
    if (page === 'home') notify('Katalog belum dapat dimuat. Buka Pilihan mobil untuk mencoba ulang.');
  } finally {
    clearTimeout(timeout);
    loadActive = false;
    if (retry) retry.disabled = false;
    document.getElementById('cars')?.setAttribute('aria-busy', 'false');
  }
}

function setupNavigation() {
  const menu = document.querySelector('.menu-toggle');
  const nav = document.getElementById('navigation');
  const narrow = matchMedia('(max-width: 59.99rem)');
  function close() { nav.hidden = narrow.matches; menu.setAttribute('aria-expanded', 'false'); }
  close();
  narrow.addEventListener('change', close);
  menu.addEventListener('click', () => { const expanded = menu.getAttribute('aria-expanded') === 'true'; nav.hidden = expanded; menu.setAttribute('aria-expanded', String(!expanded)); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && narrow.matches && !nav.hidden) { close(); menu.focus(); } });
  const theme = document.querySelector('.theme-toggle');
  let preference = 'light';
  try { preference = localStorage.getItem('rental-car:theme') || 'light'; } catch { /* Theme can work without storage. */ }
  function setTheme(value) { document.documentElement.dataset.theme = value; theme.textContent = value === 'dark' ? 'Tema terang' : 'Tema gelap'; }
  setTheme(preference === 'dark' ? 'dark' : 'light');
  theme.addEventListener('click', () => { const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(value); try { localStorage.setItem('rental-car:theme', value); } catch { /* Keep preference for the current page. */ } });
}

setupNavigation();
document.getElementById('retry')?.addEventListener('click', load);
const filters = document.getElementById('filters');
if (filters) {
  filters.addEventListener('submit', (event) => event.preventDefault());
  filters.addEventListener('input', () => { if (catalogue.length) renderCatalogue(); });
  filters.addEventListener('reset', () => { setTimeout(() => { if (catalogue.length) renderCatalogue(); }, 0); });
}
document.getElementById('download')?.addEventListener('click', () => {
  if (document.querySelector('#cart-items input:invalid')) return;
  const url = URL.createObjectURL(new Blob([quoteText(calculateQuote(items, catalogue), money)], { type: 'text/plain;charset=utf-8' }));
  const link = node('a');
  link.href = url;
  link.download = 'estimasi-sewa-mobil.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify('Ringkasan estimasi diunduh. Ini bukan bukti pemesanan.');
});
window.addEventListener('storage', (event) => {
  if ((event.key === STORAGE_KEY || event.key === null) && catalogue.length) {
    readItems(event.key === null ? null : event.newValue);
    if (page === 'catalogue') renderCatalogue();
    if (page === 'cart') renderCart();
    notify('Keranjang diperbarui dari tab lain.');
  }
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) load();
});
load();
