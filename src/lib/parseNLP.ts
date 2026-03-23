import { Character, ParsedBlock } from "../types";

export function parseNLP(text: string, characters: Character[], lastSpeaker: string | null): ParsedBlock & { isContinued?: boolean } {
  let processedText = text;

  // Replace character aliases and names with canonical names throughout the text
  if (characters && characters.length > 0) {
    // Sort all patterns by length descending to handle overlapping names correctly
    const allMappings: { pattern: string, replacement: string }[] = [];
    characters.forEach(char => {
      const aliases = char.aliases ? char.aliases.split(',').map(a => a.trim()).filter(Boolean) : [];
      aliases.forEach(alias => {
        allMappings.push({ pattern: alias, replacement: char.canonical_name });
      });
      // Also include the canonical name itself to ensure consistent casing
      allMappings.push({ pattern: char.canonical_name, replacement: char.canonical_name });
    });
    
    allMappings.sort((a, b) => b.pattern.length - a.pattern.length);
    
    const processedPatterns = new Set<string>();
    for (const mapping of allMappings) {
      const lowerPattern = mapping.pattern.toLowerCase();
      if (processedPatterns.has(lowerPattern)) continue;
      processedPatterns.add(lowerPattern);
      
      try {
        // Use word boundaries and case-insensitive matching
        const regex = new RegExp(`\\b${mapping.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
        processedText = processedText.replace(regex, mapping.replacement);
      } catch (e) {
        console.error("Regex error for pattern:", mapping.pattern, e);
      }
    }
  }

  let parsedText: any = processedText;
  let type: ParsedBlock["type"] = "action";
  let isContinued = false;
  const lowerText = processedText.toLowerCase();
  // Accept both 'scene heading' and 'seen heading' (common mishearing)
  const sceneHeadingMatch = processedText.match(/^(scene|seen) heading:?:?\s*(.+)/i);
  if (sceneHeadingMatch) {
    type = "scene_heading";
    parsedText = sceneHeadingMatch[2].trim().toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (lowerText.startsWith("new scene") || lowerText.startsWith("new seen")) {
    type = "scene_heading";
    parsedText = processedText.replace(/^new (scene|seen),?\s*/i, "").toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (lowerText.startsWith("cut to") || lowerText.startsWith("fade out")) {
    type = "transition";
    parsedText = processedText.toUpperCase() + ":";
  } else if (/^act\s+(one|two|three|four|five|\d+)$/i.test(processedText.trim())) {
    type = "act_header";
    parsedText = processedText.trim().toUpperCase();
  } else {
    let preExtractedParenthetical = "";
    let cleanedText = processedText;
    const preParaMatch = processedText.match(/^(.*?)\s*(?:para|power|parenthetical)\s+(.+?)\s+(?:para|power|parenthetical)\s*(.*?)$/i);
    if (preParaMatch) {
      preExtractedParenthetical = preParaMatch[2].trim();
      const before = preParaMatch[1].trim();
      const after = preParaMatch[3].trim();
      cleanedText = (before + (before && after ? " " : "") + after).trim();
    }

    // Dialogue: "Will says ..." or "Will continued ..."
    const dialogueMatch = cleanedText.match(/^(.+?)\s+(says|said|asks|asked|yells|yelled|whispers|whispered|replies|replied|retorts|retorted|responds|responded|queries|queried|goes on|went on|continues|continued|shouts|shouted|screams|screamed|mumbles|mumbled|stutters|stuttered|exclaims|exclaimed|states|stated|mentions|mentioned|adds|added|tells|told|explains|explained|argues|argued|insists|insisted)(?:\s+(.+))?$/i);
    if (dialogueMatch) {
      let speaker = dialogueMatch[1].trim();
      const action = dialogueMatch[2].toLowerCase();
      let dialogue = dialogueMatch[3] ? dialogueMatch[3].trim() : "";
      dialogue = dialogue.replace(/^['"]|['"]$/g, "");
      // CONT'D detection: if verb is 'continues' or 'goes on' and speaker matches lastSpeaker
      let isContd = false;
      if ((action === "continues" || action === "continued" || action === "goes on" || action === "went on") && lastSpeaker && speaker.toUpperCase() === lastSpeaker.toUpperCase()) {
        isContd = true;
      }
      // Alias lookup
      const charMatch = characters.find(c =>
        c.canonical_name.toLowerCase() === speaker.toLowerCase() ||
        (c.aliases && c.aliases.toLowerCase().split(',').map(a => a.trim()).includes(speaker.toLowerCase()))
      );
      if (charMatch) {
        speaker = charMatch.canonical_name;
      } else {
        speaker = speaker.toUpperCase();
      }
      type = "dialogue_block";
      let parenthetical = preExtractedParenthetical;

      if (!parenthetical) {
        const paraMatch = dialogue.match(/^(.*?)\s*(?:para|power|parenthetical)\s+(.+?)\s+(?:para|power|parenthetical)\s*(.*?)$/i);
        if (paraMatch) {
          const before = paraMatch[1].trim();
          const after = paraMatch[3].trim();
          parenthetical = paraMatch[2].trim();
          dialogue = (before + (before && after ? " " : "") + after).trim();
        }
      }
      // Inline parenthetical extraction
      const inlineParenMatch = dialogue.match(/^(.*?)\s*\(([^)]+)\)\s*(.*)$/);
      if (inlineParenMatch) {
        const beforeParen = inlineParenMatch[1].trim();
        const parenContent = inlineParenMatch[2].trim();
        const afterParen = inlineParenMatch[3].trim();
        dialogue = (beforeParen + (afterParen ? " " + afterParen : "")).trim();
        if (!parenthetical) {
          parenthetical = parenContent;
        }
      }
      // Capitalize first letter of dialogue
      if (dialogue) dialogue = dialogue.charAt(0).toUpperCase() + dialogue.slice(1);
      parsedText = { speaker, parenthetical, dialogue };
      isContinued = isContd;
    } else {
      // Action: capitalize first letter
      type = "action";
      parsedText = processedText.charAt(0).toUpperCase() + processedText.slice(1);

      // First character capitalized for known character names within action text
      if (characters && characters.length > 0) {
        for (const char of characters) {
          const titleCased = char.canonical_name
            .toLowerCase()
            .replace(/\b\w/g, c => c.toUpperCase());
          try {
            const regex = new RegExp(`\\b${char.canonical_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi");
            parsedText = parsedText.replace(regex, titleCased);
          } catch (e) {
          }
        }
      }
    }
  }
  return { type, parsed: parsedText, original: text, isContinued };
}
