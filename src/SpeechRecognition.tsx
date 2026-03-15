import { useRef, useEffect, useState, useCallback } from "react";

// Map spoken words to punctuation
const punctuationMap: Record<string, string> = {
  "comma": ",",
  "period": ".",
  "full stop": ".",
  "question mark": "?",
  "exclamation mark": "!",
  "exclamation point": "!",
  "colon": ":",
  "semicolon": ";",
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
  "backslash": "\\",
  "ampersand": "&",
  "percent": "%",
  "dollar": "$",
  "pound": "#",
  "star": "*",
  "asterisk": "*",
  "at sign": "@",
  "hash": "#",
  "underscore": "_",
  "plus": "+",
  "equals": "=",
  "less than": "<",
  "greater than": ">",
};

function replaceSpokenPunctuation(text: string): string {
  // Replace spoken punctuation words with actual punctuation
  // Use word boundaries and case-insensitive matching
  let result = text;
  for (const [word, symbol] of Object.entries(punctuationMap)) {
    // Replace all occurrences, case-insensitive, as whole words
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    result = result.replace(regex, symbol);
  }
  // Remove any space before punctuation (for all punctuation in the map)
  const uniquePunct = Array.from(new Set(Object.values(punctuationMap))).map(s => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('');
  // Remove space(s) before any punctuation in the map
  result = result.replace(new RegExp(`\\s+([${uniquePunct}])`, 'g'), '$1');
  return result;
}

export interface UseSpeechRecognitionOptions {
  onResult?: (finalText: string) => void;
  onInterim?: (interimText: string) => void;
  onError?: (error: any) => void;
}


export function useSpeechRecognition({ onResult, onInterim, onError }: UseSpeechRecognitionOptions = {}) {
  const recognitionRef = useRef<any>(null);
  const recognitionActiveRef = useRef(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    if ("webkitSpeechRecognition" in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event: any) => {
        let interim = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          let spoken = event.results[i][0].transcript;
          spoken = replaceSpokenPunctuation(spoken);
          if (event.results[i].isFinal) {
            finalText += spoken;
          } else {
            interim += spoken;
          }
        }
        if (onInterim) onInterim(interim);
        if (finalText && onResult) onResult(finalText);
      };

      recognitionRef.current.onerror = (event: any) => {
        recognitionActiveRef.current = false;
        setIsListening(false);
        onError && onError(event);
      };

      recognitionRef.current.onend = () => {
        recognitionActiveRef.current = false;
        if (isListening) {
          recognitionRef.current.start();
          recognitionActiveRef.current = true;
        }
      };
    }
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort && recognitionRef.current.abort();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    if (!recognitionActiveRef.current) {
      try {
        recognitionRef.current.start();
        recognitionActiveRef.current = true;
        setIsListening(true);
      } catch (e) {
        onError && onError(e);
      }
    }
  }, [onError]);

  const stop = useCallback(() => {
    if (!recognitionRef.current) return;
    if (recognitionActiveRef.current) {
      recognitionRef.current.stop();
      recognitionActiveRef.current = false;
      setIsListening(false);
    }
  }, []);

  return {
    isListening,
    start,
    stop,
  };
}