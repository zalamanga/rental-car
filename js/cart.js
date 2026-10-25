export const STORAGE_KEY = 'rental-car:cart:v1';
export const MAX_DAYS = 365;
export const MAX_QUANTITY = 10;

export function validateCatalogue(input) {
  if (!input || !Array.isArray(input.cars) || input.cars.length > 100) throw new Error('Format katalog tidak valid.');
  const ids = new Set();
  return input.cars.map((car) => {
    if (!car || !/^[a-z0-9-]{1,40}$/.test(car.id) || ids.has(car.id)
      || typeof car.name !== 'string' || !car.name.trim() || car.name.length > 100
      || typeof car.color !== 'string' || car.color.length > 40
      || !['sedan', 'suv', 'mpv'].includes(car.category)
      || !Number.isSafeInteger(car.dailyPrice) || car.dailyPrice < 1 || car.dailyPrice > 100000000
      || typeof car.image !== 'string' || !/^images\/Product\/[a-zA-Z0-9_-]+\.(?:jpe?g|webp|png)$/.test(car.image)) {
      throw new Error('Ada data mobil yang tidak valid.');
    }
    ids.add(car.id);
    return Object.freeze({ id: car.id, name: car.name.trim(), color: car.color, category: car.category, dailyPrice: car.dailyPrice, image: car.image });
  });
}

export function validAmount(value, maximum) {
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  if (!['number', 'string'].includes(typeof value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= maximum ? amount : null;
}

export function decodeCart(raw, catalogue) {
  if (raw === null) return { items: [], recovered: false };
  try {
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1 || !Array.isArray(saved.items) || saved.items.length > 100) throw new Error('Invalid cart');
    const ids = new Set(catalogue.map((car) => car.id));
    const seen = new Set();
    const items = [];
    let recovered = false;
    for (const row of saved.items) {
      if (!row || !ids.has(row.id) || seen.has(row.id) || !validAmount(row.days, MAX_DAYS) || !validAmount(row.quantity, MAX_QUANTITY)) {
        recovered = true;
        continue;
      }
      seen.add(row.id);
      items.push({ id: row.id, days: Number(row.days), quantity: Number(row.quantity) });
    }
    return { items, recovered };
  } catch {
    return { items: [], recovered: true };
  }
}

export function encodeCart(items) {
  return JSON.stringify({ version: 1, items: items.map(({ id, days, quantity }) => ({ id, days, quantity })) });
}

export function addCar(items, id) {
  const exists = items.find((row) => row.id === id);
  if (exists) return { items, added: false };
  return { items: [...items, { id, days: 1, quantity: 1 }], added: true };
}

export function calculateQuote(items, catalogue) {
  const cars = new Map(catalogue.map((car) => [car.id, car]));
  const rows = items.map((item) => {
    const car = cars.get(item.id);
    if (!car || !validAmount(item.days, MAX_DAYS) || !validAmount(item.quantity, MAX_QUANTITY)) throw new Error('Isi keranjang tidak valid.');
    return { ...car, days: Number(item.days), quantity: Number(item.quantity), subtotal: car.dailyPrice * item.days * item.quantity };
  });
  const subtotal = rows.reduce((total, row) => total + row.subtotal, 0);
  const serviceFee = Math.round(subtotal * 0.1);
  const total = subtotal + serviceFee;
  if (![subtotal, serviceFee, total].every(Number.isSafeInteger)) throw new Error('Nilai estimasi melebihi batas.');
  return { rows, subtotal, serviceFee, total };
}

export function filterCars(catalogue, { category = 'all', search = '', sort = 'name' } = {}) {
  const keyword = search.trim().toLocaleLowerCase('id-ID');
  return catalogue.filter((car) => (category === 'all' || car.category === category)
    && car.name.toLocaleLowerCase('id-ID').includes(keyword))
    .sort((a, b) => sort === 'cheapest' ? a.dailyPrice - b.dailyPrice : sort === 'expensive' ? b.dailyPrice - a.dailyPrice : a.name.localeCompare(b.name, 'id-ID'));
}

export function quoteText(quote, formatCurrency) {
  return [
    'ESTIMASI SEWA MOBIL - DEMO PORTFOLIO',
    'Ringkasan ini bukan bukti pemesanan atau pembayaran.',
    '',
    ...quote.rows.map((row) => `${row.name}: ${row.quantity} unit x ${row.days} hari x ${formatCurrency(row.dailyPrice)} = ${formatCurrency(row.subtotal)}`),
    '',
    `Subtotal: ${formatCurrency(quote.subtotal)}`,
    `Biaya simulasi 10%: ${formatCurrency(quote.serviceFee)}`,
    `Total estimasi: ${formatCurrency(quote.total)}`,
    '',
    'Tarif contoh dari proyek asli. Ketersediaan, supir, bahan bakar, deposit dan aturan pembatalan belum dihitung.',
  ].join('\n');
}
