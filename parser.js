/**
 * Myanmar 2D & 3D Bet Parser & Expansion Engine
 * Handles shorthand notations like:
 * - "45 R 200" or "45 အာ 200" -> 45: 200, 54: 200
 * - "123 R 500" -> 6 permutations for 3D
 * - "45, 59, 12 - 500" -> multi-number same amount
 * - "ပူး 500" / "အပူး 500" -> double numbers
 * - "4ထိပ် 500" / "4 ထိပ် 500" -> heads 40..49
 * - "5ပိတ် 500" / "5 ပိတ် 500" -> tails 05..95
 * - "ပါဝါ 500" -> power pairs
 * - "နက္ခတ် 500" -> natkhat pairs
 * - "ညီကို 500" -> brother pairs
 */

// Permutations for 3D Round (R)
function get3DPermutations(numStr) {
  if (numStr.length !== 3) return [numStr];
  const digits = numStr.split('');
  const results = new Set();

  function permute(arr, memo = []) {
    if (arr.length === 0) {
      results.add(memo.join(''));
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const curr = arr.slice();
      const next = curr.splice(i, 1);
      permute(curr.slice(), memo.concat(next));
    }
  }

  permute(digits);
  return Array.from(results);
}

// 2D Predefined Groups
const POWER_PAIRS = ['05', '16', '27', '38', '49', '50', '61', '72', '83', '94'];
const NATKHAT_PAIRS = ['07', '18', '24', '35', '42', '53', '69', '70', '81', '96'];
const TWIN_PAIRS = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
const BROTHER_PAIRS = [
  '01', '12', '23', '34', '45', '56', '67', '78', '89', '90',
  '10', '21', '32', '43', '54', '65', '76', '87', '98', '09'
];

/**
 * Parse a raw text slip into structured bet items.
 * @param {string} text - The raw text entered by user or copied from Telegram.
 * @param {'2D'|'3D'} lotteryType - Default lottery type if not specified.
 * @returns {{ items: Array<{number: string, amount: number, originalText: string}>, totalAmount: number, errors: string[] }}
 */
function parseBets(text, lotteryType = '2D') {
  if (!text || typeof text !== 'string') {
    return { items: [], totalAmount: 0, errors: [] };
  }

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items = [];
  const errors = [];

  for (const line of lines) {
    // Normalization: convert Myanmar digits to English digits
    const normalizedLine = line
      .replace(/[၀-၉]/g, d => '၀၁၂၃၄၅၆၇၈၉'.indexOf(d).toString())
      .replace(/[\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalizedLine) continue;

    // Check for special patterns
    // 1. "ပူး 500" or "အပူး 500"
    const twinMatch = normalizedLine.match(/^(?:အ?ပူး|twin)\s*[-=: ]*\s*(\d+)$/i);
    if (twinMatch) {
      const amt = parseInt(twinMatch[1], 10);
      if (amt > 0) {
        TWIN_PAIRS.forEach(num => items.push({ number: num, amount: amt, originalText: line }));
        continue;
      }
    }

    // 2. "ပါဝါ 500" (Power)
    const powerMatch = normalizedLine.match(/^(?:ပါဝါ|power)\s*[-=: ]*\s*(\d+)$/i);
    if (powerMatch) {
      const amt = parseInt(powerMatch[1], 10);
      if (amt > 0) {
        POWER_PAIRS.forEach(num => items.push({ number: num, amount: amt, originalText: line }));
        continue;
      }
    }

    // 3. "နက္ခတ် 500" (Natkhat)
    const natkhatMatch = normalizedLine.match(/^(?:နက္ခတ်|natkhat)\s*[-=: ]*\s*(\d+)$/i);
    if (natkhatMatch) {
      const amt = parseInt(natkhatMatch[1], 10);
      if (amt > 0) {
        NATKHAT_PAIRS.forEach(num => items.push({ number: num, amount: amt, originalText: line }));
        continue;
      }
    }

    // 4. "ညီကို 500" (Brother)
    const brotherMatch = normalizedLine.match(/^(?:ညီကို|brother)\s*[-=: ]*\s*(\d+)$/i);
    if (brotherMatch) {
      const amt = parseInt(brotherMatch[1], 10);
      if (amt > 0) {
        BROTHER_PAIRS.forEach(num => items.push({ number: num, amount: amt, originalText: line }));
        continue;
      }
    }

    // 5. "4ထိပ် 500" or "4 ထိပ် 500" (Head)
    const headMatch = normalizedLine.match(/^(\d)\s*(?:ထိပ်|head)\s*[-=: ]*\s*(\d+)$/i);
    if (headMatch) {
      const headDigit = headMatch[1];
      const amt = parseInt(headMatch[2], 10);
      if (amt > 0) {
        for (let i = 0; i <= 9; i++) {
          items.push({ number: `${headDigit}${i}`, amount: amt, originalText: line });
        }
        continue;
      }
    }

    // 6. "5ပိတ် 500" or "5 ပိတ် 500" (Tail)
    const tailMatch = normalizedLine.match(/^(\d)\s*(?:ပိတ်|tail)\s*[-=: ]*\s*(\d+)$/i);
    if (tailMatch) {
      const tailDigit = tailMatch[1];
      const amt = parseInt(tailMatch[2], 10);
      if (amt > 0) {
        for (let i = 0; i <= 9; i++) {
          items.push({ number: `${i}${tailDigit}`, amount: amt, originalText: line });
        }
        continue;
      }
    }

    // 7. General Pattern: Numbers with optional R/အာ/Round and Amount
    // Example: "45 R 200", "45 r 200", "45 အာ 200", "45*200", "45-200", "45 200"
    // Also multi-number: "45, 59, 12 - 500" or "45, 59 R 500"
    const generalMatch = normalizedLine.match(/^([\d,\s/]+?)\s*([rR]|အာ|ပတ်လည်|round)?\s*[-=*: ]+\s*(\d+)$/i);

    if (generalMatch) {
      const rawNumbers = generalMatch[1];
      const isReverse = Boolean(generalMatch[2]);
      const amount = parseInt(generalMatch[3], 10);

      if (amount <= 0) {
        errors.push(`ပမာဏ မှားယွင်းနေပါသည်: "${line}"`);
        continue;
      }

      // Split comma or space separated numbers
      const numTokens = rawNumbers.split(/[,\s/]+/).map(s => s.trim()).filter(Boolean);

      for (const token of numTokens) {
        if (!/^\d+$/.test(token)) {
          errors.push(`ဂဏန်းမဟုတ်သော စာသားပါဝင်နေပါသည်: "${token}" in "${line}"`);
          continue;
        }

        // Determine if token is 2D or 3D
        if (token.length === 2) {
          if (isReverse) {
            const rev = token[1] + token[0];
            items.push({ number: token, amount, originalText: line });
            if (rev !== token) {
              items.push({ number: rev, amount, originalText: `${token} အာ -> ${rev}` });
            }
          } else {
            items.push({ number: token, amount, originalText: line });
          }
        } else if (token.length === 3) {
          if (isReverse) {
            const permutations = get3DPermutations(token);
            permutations.forEach(p => {
              items.push({ number: p, amount, originalText: `${token} R -> ${p}` });
            });
          } else {
            items.push({ number: token, amount, originalText: line });
          }
        } else {
          errors.push(`ဂဏန်းအလျား မှားယွင်းနေပါသည် (2 လုံး သို့မဟုတ် 3 လုံးဖြစ်ရမည်): "${token}"`);
        }
      }
      continue;
    }

    // 8. Try simple fallback: "95 1000" where separator is just space
    const fallbackMatch = normalizedLine.match(/^(\d{2,3})\s+(\d+)$/);
    if (fallbackMatch) {
      const num = fallbackMatch[1];
      const amt = parseInt(fallbackMatch[2], 10);
      items.push({ number: num, amount: amt, originalText: line });
      continue;
    }

    errors.push(`စာသားပုံစံ နားမလည်ပါ: "${line}"`);
  }

  // Calculate total amount
  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);

  return {
    items,
    totalAmount,
    errors
  };
}

module.exports = {
  parseBets,
  get3DPermutations,
  POWER_PAIRS,
  NATKHAT_PAIRS,
  TWIN_PAIRS,
  BROTHER_PAIRS
};
