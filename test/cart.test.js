import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCatalogue, validAmount, decodeCart, encodeCart, addCar, calculateQuote, filterCars, quoteText } from '../js/cart.js';

const catalogue = validateCatalogue(JSON.parse(await readFile(new URL('../data.json', import.meta.url), 'utf8')));

test('original six cars retain category and integer daily rates', () => {
  assert.equal(catalogue.length, 6);
  assert.equal(catalogue.find((car) => car.id === 'corolla').dailyPrice, 300000);
  assert.deepEqual([...new Set(catalogue.map((car) => car.category))].sort(), ['mpv', 'sedan', 'suv']);
});

test('category and search filters compose without mutating the catalogue', () => {
  const result = filterCars(catalogue, { category: 'suv', search: ' TOYOTA ', sort: 'name' });
  assert.deepEqual(result.map((car) => car.id), ['fortuner']);
  assert.equal(catalogue[0].id, 'corolla');
  assert.equal(filterCars(catalogue, { search: 'not found' }).length, 0);
});

test('sorting uses numeric rates rather than formatted rupiah strings', () => {
  assert.deepEqual(filterCars(catalogue, { sort: 'cheapest' }).map((car) => car.dailyPrice), [230000, 250000, 300000, 350000, 500000, 550000]);
  assert.equal(filterCars(catalogue, { category: 'sedan', sort: 'expensive' })[0].id, 'civic');
});

test('adding after decoded page navigation retains earlier choices and prevents duplicate rows', () => {
  const first = addCar([], 'civic').items;
  const restored = decodeCart(encodeCart(first), catalogue).items;
  const second = addCar(restored, 'xenia');
  assert.equal(second.added, true);
  assert.equal(second.items.length, 2);
  assert.equal(addCar(second.items, 'civic').added, false);
  assert.equal(addCar(second.items, 'civic').items.length, 2);
});

test('days and quantity persist independently across encode/decode', () => {
  const original = [{ id: 'civic', days: 5, quantity: 2 }];
  assert.deepEqual(decodeCart(encodeCart(original), catalogue), { items: original, recovered: false });
});

test('malformed, non-object, oversized and wrong-version storage recovers as empty', () => {
  for (const raw of ['{', 'null', '[]', 'true', JSON.stringify({ version: 2, items: [] }), JSON.stringify({ version: 1, items: Array(101).fill({ id: 'civic', days: 1, quantity: 1 }) })]) {
    assert.deepEqual(decodeCart(raw, catalogue), { items: [], recovered: true });
  }
  assert.deepEqual(decodeCart(null, catalogue), { items: [], recovered: false });
});

test('recovery keeps valid rows while dropping unknown, duplicate and invalid rows', () => {
  const raw = JSON.stringify({ version: 1, items: [
    { id: 'civic', days: 2, quantity: 1 }, { id: 'civic', days: 3, quantity: 1 },
    { id: 'unknown', days: 1, quantity: 1 }, { id: 'xenia', days: -2, quantity: 1 }, null,
    { id: 'corolla', days: 4, quantity: 2 },
  ] });
  assert.deepEqual(decodeCart(raw, catalogue), { items: [{ id: 'civic', days: 2, quantity: 1 }, { id: 'corolla', days: 4, quantity: 2 }], recovered: true });
});

test('browser-manipulated price, image and name never become quote authority', () => {
  const raw = JSON.stringify({ version: 1, items: [{ id: 'corolla', days: 2, quantity: 1, dailyPrice: 1, name: '<img onerror=evil>', image: 'javascript:evil' }] });
  const rows = decodeCart(raw, catalogue).items;
  const quote = calculateQuote(rows, catalogue);
  assert.equal(quote.subtotal, 600000);
  assert.equal(quote.rows[0].name, 'Toyota Corolla');
  assert.equal(quote.rows[0].image, 'images/Product/corolla.jpeg');
  assert.equal(encodeCart(rows).includes('dailyPrice'), false);
});

test('line items include both units and days, with original ten-percent simulation', () => {
  const quote = calculateQuote([{ id: 'corolla', days: 3, quantity: 2 }, { id: 'xenia', days: 1, quantity: 1 }], catalogue);
  assert.equal(quote.rows[0].subtotal, 1800000);
  assert.equal(quote.subtotal, 2030000);
  assert.equal(quote.serviceFee, 203000);
  assert.equal(quote.total, 2233000);
  assert.deepEqual(calculateQuote([], catalogue), { rows: [], subtotal: 0, serviceFee: 0, total: 0 });
});

test('invalid day/unit values and values beyond configured bounds are rejected', () => {
  for (const value of ['', 0, -1, '1.5', '1e2', 1.5, Infinity, NaN, null, true, {}, 366]) assert.equal(validAmount(value, 365), null, String(value));
  assert.equal(validAmount('365', 365), 365);
  assert.equal(validAmount(1, 365), 1);
  assert.throws(() => calculateQuote([{ id: 'civic', days: 0, quantity: 1 }], catalogue));
  assert.throws(() => calculateQuote([{ id: 'civic', days: 1, quantity: 11 }], catalogue));
  assert.throws(() => calculateQuote([{ id: 'unknown', days: 1, quantity: 1 }], catalogue));
});

test('invalid catalogue paths, duplicate IDs and non-integer rates fail closed', () => {
  for (const changes of [{ image: '../secret' }, { dailyPrice: '300.000' }, { dailyPrice: -1 }, { category: 'truck' }, { id: '<script>' }]) {
    assert.throws(() => validateCatalogue({ cars: [{ ...catalogue[0], ...changes }] }));
  }
  assert.throws(() => validateCatalogue({ cars: [catalogue[0], catalogue[0]] }));
  assert.throws(() => validateCatalogue({ cars: {} }));
});

test('download text reflects current quantities and discloses estimate limits', () => {
  const quote = calculateQuote([{ id: 'corolla', days: 2, quantity: 3 }], catalogue);
  const text = quoteText(quote, (value) => `Rp${value}`);
  assert.match(text, /Toyota Corolla: 3 unit x 2 hari/);
  assert.match(text, /Total estimasi: Rp1980000/);
  assert.match(text, /bukan bukti pemesanan atau pembayaran/);
});
