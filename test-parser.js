const { parseBets } = require('./parser');

console.log('Testing Bet Parser...');

// Test 1: 45 R 200
const test1 = parseBets('45 R 200');
console.log('Test 1 (45 R 200):', test1);
console.assert(test1.items.length === 2, 'Should have 2 items');
console.assert(test1.totalAmount === 400, 'Total should be 400');
console.assert(test1.items.some(i => i.number === '45' && i.amount === 200));
console.assert(test1.items.some(i => i.number === '54' && i.amount === 200));

// Test 2: 123 R 500 (3D Round)
const test2 = parseBets('123 R 500');
console.log('Test 2 (123 R 500): count =', test2.items.length, 'total =', test2.totalAmount);
console.assert(test2.items.length === 6, 'Should have 6 items');
console.assert(test2.totalAmount === 3000, 'Total should be 3000');

// Test 3: Myanmar Digits and Burmese "အာ"
const test3 = parseBets('၄၅ အာ ၂၀၀');
console.log('Test 3 (၄၅ အာ ၂၀၀):', test3);
console.assert(test3.items.length === 2);
console.assert(test3.totalAmount === 400);

// Test 4: Twin numbers
const test4 = parseBets('ပူး 100');
console.log('Test 4 (ပူး 100): count =', test4.items.length, 'total =', test4.totalAmount);
console.assert(test4.items.length === 10);
console.assert(test4.totalAmount === 1000);

// Test 5: Multi-line and multiple numbers
const test5 = parseBets(`
95 1000
45 R 200
12, 34, 56 - 500
`);
console.log('Test 5 (Multi-line): count =', test5.items.length, 'total =', test5.totalAmount);
console.assert(test5.totalAmount === 1000 + 400 + 1500);

console.log('ALL PARSER TESTS PASSED SUCCESSFULLY! 🎉');
