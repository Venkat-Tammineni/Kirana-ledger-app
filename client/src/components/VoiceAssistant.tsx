import { useEffect, useMemo, useRef, useState } from "react";
import { Info, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VoiceCommand = {
  label: string;
  examples: string[];
  run: (input: { raw: string; normalized: string }) => string | null;
};

type VoiceAssistantProps = {
  title: string;
  subtitle: string;
  commands: VoiceCommand[];
  className?: string;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

let activeVoiceAssistantStop: (() => void) | null = null;

export function VoiceAssistant({ title, subtitle, commands, className }: VoiceAssistantProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [feedback, setFeedback] = useState("Tap the mic and say a command.");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const keepListeningRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);

  const SpeechRecognitionApi = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : window.SpeechRecognition || window.webkitSpeechRecognition || null,
    [],
  );

  useEffect(() => {
    return () => {
      if (activeVoiceAssistantStop === stopListening) {
        activeVoiceAssistantStop = null;
      }
      keepListeningRef.current = false;
      if (restartTimeoutRef.current != null) {
        window.clearTimeout(restartTimeoutRef.current);
        restartTimeoutRef.current = null;
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const stopListening = () => {
    keepListeningRef.current = false;
    if (activeVoiceAssistantStop === stopListening) {
      activeVoiceAssistantStop = null;
    }
    if (restartTimeoutRef.current != null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
  };

  const startListening = () => {
    if (!SpeechRecognitionApi) {
      setFeedback("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-IN";
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      const transcript = event.results?.[event.results.length - 1]?.[0]?.transcript || "";
      if (!transcript.trim()) return;
      handleTranscript(transcript);
    };
    recognition.onerror = (event) => {
      const blockingErrors = new Set(["not-allowed", "service-not-allowed", "audio-capture"]);
      if (event.error === "no-speech") {
        setFeedback("Listening... Say the item or command again.");
        return;
      }
      setFeedback(
        event.error === "not-allowed"
          ? "Mic permission is blocked."
          : "Voice input failed. Please try again.",
      );
      if (blockingErrors.has(event.error)) {
        keepListeningRef.current = false;
        setIsListening(false);
      }
    };
    recognition.onend = () => {
      if (!keepListeningRef.current) {
        setIsListening(false);
        return;
      }

      if (restartTimeoutRef.current != null) {
        window.clearTimeout(restartTimeoutRef.current);
      }
      restartTimeoutRef.current = window.setTimeout(() => {
        if (!keepListeningRef.current) return;
        try {
          startListening();
        } catch {
          setFeedback("Voice input failed. Please try again.");
          setIsListening(false);
          keepListeningRef.current = false;
        }
      }, 150);
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    setFeedback("Listening... I will keep listening until you stop the mic.");
    try {
      recognition.start();
    } catch {
      setFeedback("Voice input could not start. Please tap the mic again.");
      setIsListening(false);
      keepListeningRef.current = false;
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    }
  };

  const handleTranscript = (rawTranscript: string) => {
    const raw = rawTranscript.trim();
    const normalized = raw
      .toLowerCase()
      .replace(/[.,!?;:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    setLastHeard(raw);

    for (const command of commands) {
      const result = command.run({ raw, normalized });
      if (result) {
        setFeedback(result);
        return;
      }
    }

    setFeedback("I heard you, but I could not match that command yet.");
  };

  const toggleListening = () => {
    if (!SpeechRecognitionApi) {
      setFeedback("Voice input is not supported in this browser.");
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    activeVoiceAssistantStop?.();
    activeVoiceAssistantStop = stopListening;
    keepListeningRef.current = true;
    startListening();
  };

  return (
    <div className={cn("fixed bottom-20 right-4 z-50 flex flex-col items-end gap-3", className)}>
      {isExpanded && (
        <div className="w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{title}</div>
              <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
              Close
            </Button>
          </div>
          <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="font-medium">Status</div>
            <div className="mt-1 text-muted-foreground">{feedback}</div>
            {lastHeard && (
              <div className="mt-2 text-xs text-muted-foreground">
                Heard: <span className="font-medium text-foreground">{lastHeard}</span>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-sm font-medium">Try saying</div>
            <div className="space-y-2">
              {commands.map((command) => (
                <div key={command.label} className="rounded-xl border border-border p-2">
                  <div className="text-sm font-medium">{command.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{command.examples.join(" • ")}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <Button
        type="button"
        size="icon"
        variant="outline"
        className="h-10 w-10 rounded-full shadow-md bg-background"
        onClick={() => setIsExpanded((current) => !current)}
        title="Voice help"
      >
        <Info className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="icon"
        className={cn(
          "h-14 w-14 rounded-full shadow-lg",
          isListening ? "bg-red-600 hover:bg-red-700 text-white" : "bg-primary hover:bg-primary/90",
        )}
        onClick={toggleListening}
        title="Voice assistant"
      >
        {isListening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
      </Button>
    </div>
  );
}
