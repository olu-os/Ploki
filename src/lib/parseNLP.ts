import { Character, ParsedBlock } from "../types";

export function parseNLP(text: string, characters: Character[], lastSpeaker: string | null): ParsedBlock & { isContinued?: boolean } {
  let processedText = text;

  if (characters && characters.length > 0) {
    const allMappings: { pattern: string, replacement: string }[] = [];
    characters.forEach(char => {
      const aliases = char.aliases ? char.aliases.split(',').map(a => a.trim()).filter(Boolean) : [];
      aliases.forEach(alias => {
        allMappings.push({ pattern: alias, replacement: char.canonical_name });
      });
      allMappings.push({ pattern: char.canonical_name, replacement: char.canonical_name });
    });
    
    allMappings.sort((a, b) => b.pattern.length - a.pattern.length);
    
    const processedPatterns = new Set<string>();
    for (const mapping of allMappings) {
      const lowerPattern = mapping.pattern.toLowerCase();
      if (processedPatterns.has(lowerPattern)) continue;
      processedPatterns.add(lowerPattern);
      
      try {
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
  const sceneHeadingRegex = /^(scene|seen) heading:?:?\s*(.+)|^slugline:?:?\s*(.+)/i;
  const sceneHeadingNaturalRegex = /^(interior|exterior|int\.?|ext\.?)(\s|:)/i;
  const actHeaderNaturalRegex = /^act\s*((one|two|three|four|five|six|seven|eight|nine|ten|\d+))(\b|\s|:)/i;
  if (sceneHeadingRegex.test(processedText)) {
    const sceneHeadingMatch = processedText.match(sceneHeadingRegex);
    type = "scene_heading";
    parsedText = (sceneHeadingMatch?.[2] ?? sceneHeadingMatch?.[3] ?? "").trim().toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (sceneHeadingNaturalRegex.test(processedText.trim().toLowerCase())) {
    type = "scene_heading";
    parsedText = processedText.trim().toUpperCase();
    parsedText = parsedText.replace(/^INTERIOR/i, "INT.").replace(/^EXTERIOR/i, "EXT.").replace(/^INT\.?/i, "INT.").replace(/^EXT\.?/i, "EXT.");
  } else if (lowerText.startsWith("new scene") || lowerText.startsWith("new seen")) {
    type = "scene_heading";
    parsedText = processedText.replace(/^new (scene|seen),?\s*/i, "").toUpperCase();
    parsedText = parsedText.replace(/exterior/i, "EXT.").replace(/interior/i, "INT.");
  } else if (lowerText.startsWith("cut to") || lowerText.startsWith("fade out")) {
    type = "transition";
    parsedText = processedText.toUpperCase() + ":";
  } else if (actHeaderNaturalRegex.test(processedText.trim().toLowerCase())) {
    type = "act_header";
    const match = processedText.trim().match(actHeaderNaturalRegex);
    if (match) {
      const actLabel = match[1];
      parsedText = `ACT ${actLabel}`.toUpperCase();
    } else {
      parsedText = processedText.trim().toUpperCase();
    }
  } else if (/^act\s+(one|two|three|four|five|\d+)$/i.test(processedText.trim())) {
    type = "act_header";
    parsedText = processedText.trim().toUpperCase();
  } else if (/^act header[:]?*(.*)$/i.test(processedText.trim())) {
    type = "act_header";
    const label = processedText.trim().replace(/^act header[:]?*/i, "").trim();
    parsedText = label ? label.toUpperCase() : "ACT";
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

    const dialogueMatch = cleanedText.match(/^(.+?)\s+(says|said|asks|asked|yells|yelled|whispers|whispered|replies|replied|retorts|retorted|responds|responded|queries|queried|goes on|went on|continues|continued|shouts|shouted|screams|screamed|mumbles|mumbled|stutters|stuttered|exclaims|exclaimed|states|stated|mentions|mentioned|adds|added|tells|told|explains|explained|argues|argued|insists|insisted)[,:.]*(?:\s+(.+))?$/i);
    if (dialogueMatch) {
      let speaker = dialogueMatch[1].trim();
      const beforeVerbWordCount = speaker.split(/\s+/).filter(Boolean).length;
      
      if (beforeVerbWordCount > 2) {
        type = "action";
        parsedText = processedText.charAt(0).toUpperCase() + processedText.slice(1);
      } else {
        let dialogue = dialogueMatch[3] ? dialogueMatch[3].trim().replace(/^['"]|['"]$/g, "") : "";
        const action = dialogueMatch[2].toLowerCase();
        let isContd = false;
        if ((action === "continues" || action === "continued" || action === "goes on" || action === "went on") && lastSpeaker && speaker.toUpperCase() === lastSpeaker.toUpperCase()) {
          isContd = true;
        }
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
        if (dialogue) dialogue = dialogue.charAt(0).toUpperCase() + dialogue.slice(1);
        parsedText = { speaker, parenthetical, dialogue };
        isContinued = isContd;
      }
    } else {
      type = "action";
      parsedText = processedText.charAt(0).toUpperCase() + processedText.slice(1);

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
