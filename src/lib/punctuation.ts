const punctuationMap: Record<string, string> = {
  "comma": ",",
  "period": ".",
  "full stop": ".",
  "question mark": "?",
  "exclamation mark": "!",
  "exclamation point": "!",
  "colon": ":",
  "semicolon": ";",
  "dot dot dot": "...",
  "dot dot": "...",
  "ellipsis": "...",
  "dash": "-",
  "hyphen": "-",
  "open parenthesis": "(",
  "close parenthesis": ")",
  "open bracket": "[",
  "close bracket": "]",
  "open brace": "{",
  "close brace": "}",
  "apostrophe": "'",
  "quote": '"',
  "double quote": '"',
  "slash": "/",
};

export function replaceSpokenPunctuation(text: string, capitalize = true): string {
  if (!text) return "";
  let result = text;
  for (const [word, symbol] of Object.entries(punctuationMap)) {
    const parts = word.split(" ");
    if (parts.length === 2) {
      const [a, b] = parts;
      const regex1 = new RegExp(`\\b${a} ${b}\\b`, "gi");
      const regex2 = new RegExp(`\\b${b} ${a}\\b`, "gi");
      result = result.replace(regex1, symbol);
      result = result.replace(regex2, symbol);
    } else {
      const regex = new RegExp(`\\b${word}\\b`, "gi");
      result = result.replace(regex, symbol);
    }
  }
  // Remove any space before punctuation (.,!?:; etc.)
  result = result.replace(/\s+([.,!?:;])/g, '$1');
  // Handle cases where punctuation might have been joined with a space previously
  result = result.replace(/([a-zA-Z0-9])\s+([.,!?:;])/g, '$1$2');
  // Ensure space after punctuation (except if followed by another punctuation or end of string)
  result = result.replace(/([.,!?:;])([a-zA-Z0-9])/g, '$1 $2');
  // Remove any double spaces
  result = result.replace(/\s{2,}/g, ' ');
  result = result.trim();

  if (result.length > 0 && capitalize) {
    // Capitalize first letter of the whole string
    result = result.charAt(0).toUpperCase() + result.slice(1);
    // Capitalize first letter after strong punctuation (handles multiple marks and trailing spaces/quotes)
    result = result.replace(/([.?!]+[\s"')]*)(\w)/g, (match, p1, p2) => p1 + p2.toUpperCase());
  }
  // Capitalize standalone "i"
  result = result.replace(/\bi\b/g, "I");
  return result;
}
