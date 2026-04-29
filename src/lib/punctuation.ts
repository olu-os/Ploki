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
  "dash dash": "--",
  "hyphen": "-",
  "open parenthesis": "(",
  "close parenthesis": ")",
  "open para": "(",
  "close para": ")",
  "open bracket": "[",
  "close bracket": "]",
  "open brace": "{",
  "close brace": "}",
  "apostrophe": "'",
  "quote": '"',
  "double quote": '"'
};

// Shorthand aliases that may appear with or without a trailing period
const shorthandAliases: Record<string, string> = {
  "para": "()",
  "power": "^",
};

// Single-word shorthands that should match with an optional trailing dot
const shorthandMap: Record<string, string> = {
  "open para": "(",
  "close para": ")",
  "open power": "^(",   // adjust symbol as needed
  "close power": "^)",
};

export function replaceSpokenPunctuation(text: string, capitalize = true): string {
  if (!text) return "";
  let result = text;


  // Remove all punctuation after para/power (single or paired)
  // Note: \b is placed before punctuation chars since \b after punct has no effect
  // Paired: para ... para
  result = result.replace(/\bpara\b[.,!?:;]*\s+(.+?)\s+\bpara\b[.,!?:;]*/gi, '($1)');
  result = result.replace(/\bpower\b[.,!?:;]*\s+(.+?)\s+\bpower\b[.,!?:;]*/gi, '($1)');

  // Single: para or power (open/close)
  result = result.replace(/\bopen\s+para\b[.,!?:;]*/gi, "(");
  result = result.replace(/\bclose\s+para\b[.,!?:;]*/gi, ")");
  result = result.replace(/\bopen\s+power\b[.,!?:;]*/gi, "(");
  result = result.replace(/\bclose\s+power\b[.,!?:;]*/gi, ")");
  result = result.replace(/\bpara\b[.,!?:;]*/gi, "(");
  result = result.replace(/\bpower\b[.,!?:;]*/gi, ")");

for (const [word, symbol] of Object.entries(punctuationMap)) {
  const parts = word.split(" ");
  if (parts.length === 2) {
    const [a, b] = parts;
    const regex1 = new RegExp(`\\b${a}\\s+${b}\\b`, "gi");
    const regex2 = new RegExp(`\\b${b}\\s+${a}\\b`, "gi");
    result = result.replace(regex1, symbol);
    result = result.replace(regex2, symbol);
  } else {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, symbol);
  }
}

  // Remove any space before punctuation (.,!?:; etc.)
  result = result.replace(/\s+([.,!?:;])/g, '$1');
  result = result.replace(/([a-zA-Z0-9])\s+([.,!?:;])/g, '$1$2');
  // Ensure space after punctuation (except if followed by another punctuation or end of string)
  result = result.replace(/([.,!?:;])([a-zA-Z0-9])/g, '$1 $2');
  // Remove any double spaces
  result = result.replace(/\s{2,}/g, ' ');
  result = result.trim();

  if (result.length > 0 && capitalize) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
    result = result.replace(/([.?!]+[\s"')]*)(\w)/g, (match, p1, p2) => p1 + p2.toUpperCase());
  }
  // Capitalize standalone "i"
  result = result.replace(/\bi\b/g, "I");

  // Remove punctuation immediately before an open parenthesis
  result = result.replace(/([.,!?:;])\s*\(/g, ' (');
  // Normalize spaces around parentheses
  result = result.replace(/\s*\(\s*/g, " (");
  result = result.replace(/\s*\)\s*/g, ") ");
  // Remove any punctuation immediately after a closing parenthesis
  result = result.replace(/\)\s*([.,!?:;]+)/g, ')');

  return result.trim().replace(/\s+/g, " ");
}