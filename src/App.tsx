import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const API_URL = "/api/translate";
const API_KEY = import.meta.env.VITE_API_KEY ?? "";
const TTS_API_URL = "https://tts.wangwangit.com/v1/audio/speech";

const LANGUAGE_OPTIONS = [
  { code: "auto", label: "自动检测" },
  { code: "zh", label: "简体中文" },
  { code: "zh-Hant", label: "繁体中文" },
  { code: "en", label: "英语" },
  { code: "ja", label: "日语" },
  { code: "ko", label: "韩语" },
  { code: "fr", label: "法语" },
  { code: "de", label: "德语" },
  { code: "ru", label: "俄语" },
  { code: "es", label: "西班牙语" },
  { code: "pt", label: "葡萄牙语" },
  { code: "it", label: "意大利语" },
  { code: "ar", label: "阿拉伯语" },
  { code: "vi", label: "越南语" },
  { code: "id", label: "印尼语" },
];

function getLocaleForLang(code: string) {
  const locales: Record<string, string> = {
    zh: "zh-CN", "zh-Hant": "zh-TW", ja: "ja-JP", ko: "ko-KR",
    fr: "fr-FR", de: "de-DE", ru: "ru-RU", es: "es-ES",
    pt: "pt-PT", it: "it-IT", ar: "ar-SA", vi: "vi-VN", id: "id-ID",
  };
  return locales[code] ?? "en-US";
}

function getTtsVoiceForLang(code: string) {
  const voices: Record<string, string> = {
    zh: "zh-CN-XiaoxiaoNeural",
    "zh-Hant": "zh-TW-HsiaoChenNeural",
    ja: "ja-JP-NanamiNeural",
    ko: "ko-KR-SoonBokNeural",
    fr: "fr-FR-DeniseNeural",
    de: "de-DE-KatjaNeural",
    ru: "ru-RU-SvetlanaNeural",
    es: "es-ES-ElviraNeural",
    pt: "pt-BR-FranciscaNeural",
    it: "it-IT-BiancaNeural",
    ar: "ar-SA-ZariyahNeural",
    vi: "vi-VN-HoaiMyNeural",
    id: "id-ID-GadisNeural",
    en: "en-US-JennyNeural",
  };
  return voices[code] ?? "zh-CN-XiaoxiaoNeural";
}

function speechRecognition() {
  if (typeof window === "undefined") return null;
  return (window as Window & {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).SpeechRecognition ?? (window as Window & {
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }).webkitSpeechRecognition ?? null;
}

type SpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: () => void;
  onresult: (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onerror: (event: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

export default function App() {
  const [sourceLang, setSourceLang] = useState("auto");
  const [targetLang, setTargetLang] = useState("en");
  const [text, setText] = useState("");
  const [translated, setTranslated] = useState("");
  const [transcription, setTranscription] = useState("");
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canRecognize = Boolean(speechRecognition());

  useEffect(() => () => {
    recognitionRef.current?.stop();
    audioRef.current?.pause();
    if (audioRef.current?.src) {
      URL.revokeObjectURL(audioRef.current.src);
    }
  }, []);

  function startRecognition() {
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = getLocaleForLang(sourceLang);
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsRecognizing(true);
    recognition.onresult = (event) => {
      let result = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        result += event.results[i][0].transcript;
      }
      setTranscription(result);
      setText((current) => (current ? `${current} ${result}` : result));
    };
    recognition.onerror = (event) => {
      console.error("recognition error", event);
      setIsRecognizing(false);
    };
    recognition.onend = () => {
      setIsRecognizing(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopRecognition() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecognizing(false);
  }

  async function translate() {
    if (!text.trim() || isTranslating) return;
    setIsTranslating(true);
    setTranslated("");
    try {
      const isTauri = "__TAURI_INTERNALS__" in window;
      const json = isTauri
        ? await invoke<Record<string, unknown>>("translate_request", {
          text,
          sourceLang,
          targetLang,
          apiKey: API_KEY,
        })
        : await (async () => {
          const response = await fetch(API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
            },
            body: JSON.stringify({ text, sourceLang, targetLang, stream: false }),
          });
          if (!response.ok) throw new Error(`请求失败（${response.status}）`);
          return response.json();
        })();
      const extract = (value: unknown): string | null => {
        if (typeof value === "string") return value;
        if (!value || typeof value !== "object") return null;
        if (Array.isArray(value)) return value.map(extract).find(Boolean) ?? null;
        const object = value as Record<string, unknown>;
        for (const key of ["translatedText", "translation", "translated", "text"]) {
          if (typeof object[key] === "string") return object[key] as string;
        }
        return extract(object.result) ?? extract(object.data) ?? extract(object.translations);
      };
      setTranslated(extract(json) ?? JSON.stringify(json, null, 2));
    } catch (error) {
      console.error(error);
      setTranslated(`翻译失败：${error instanceof Error ? error.message : "请稍后重试"}`);
    } finally {
      setIsTranslating(false);
    }
  }

  async function copyResult() {
    if (!translated) return;
    await navigator.clipboard.writeText(translated);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function toggleSpeech() {
    if (!translated) return;

    if (isSpeaking) {
      audioRef.current?.pause();
      audioRef.current = null;
      setIsSpeaking(false);
      return;
    }

    try {
      setIsSpeaking(true);
      const response = await fetch(TTS_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: translated,
          voice: getTtsVoiceForLang(targetLang),
          speed: 1.0,
          pitch: "0",
          style: "general",
        }),
      });

      if (!response.ok) {
        throw new Error(`语音生成失败：${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src.startsWith("blob:")) {
          URL.revokeObjectURL(audioRef.current.src);
        }
      }

      audioRef.current = audio;
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (error) {
      console.error(error);
      setIsSpeaking(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">译</div>
          <div><strong>TransLaTor</strong><span>AI 智能翻译</span></div>
        </div>
        <div className="secure-badge"><span /> API 已连接</div>
      </header>

      <section className="hero">
        <p className="eyebrow">LANGUAGE, WITHOUT BARRIERS</p>
        <h1>让每句话，都被准确理解。</h1>
        <p className="subtitle">输入文字或使用语音，快速获得自然、流畅的翻译结果。</p>
      </section>

      <section className="translator-card">
        <div className="language-bar">
          <label>源语言
            <select value={sourceLang} onChange={(event) => setSourceLang(event.target.value)}>
              {LANGUAGE_OPTIONS.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
          </label>
          <button className="swap-button" aria-label="交换语言" onClick={() => {
            if (sourceLang !== "auto") {
              setSourceLang(targetLang);
              setTargetLang(sourceLang);
            }
          }}>⇄</button>
          <label>目标语言
            <select value={targetLang} onChange={(event) => setTargetLang(event.target.value)}>
              {LANGUAGE_OPTIONS.filter((language) => language.code !== "auto").map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}
            </select>
          </label>
        </div>

        <div className="panels">
          <div className="panel input-panel">
            <div className="panel-heading"><span>原文</span><span className="char-count">{text.length} / 5,000</span></div>
            <textarea maxLength={5000} value={text} onChange={(event) => setText(event.target.value)} placeholder="在这里输入要翻译的内容..." />
            <div className="panel-footer">
              {canRecognize ? <button className={`voice-button ${isRecognizing ? "recording" : ""}`} onClick={() => (isRecognizing ? stopRecognition() : startRecognition())}>
                <span>{isRecognizing ? "●" : "♩"}</span>{isRecognizing ? "正在聆听..." : "语音输入"}
              </button> : <span className="muted">当前环境不支持语音输入</span>}
              {transcription && <span className="transcription">实时识别：{transcription}</span>}
              {text && <button className="clear-button" onClick={() => { setText(""); setTranscription(""); }}>清空</button>}
            </div>
          </div>
          <div className="panel result-panel">
            <div className="panel-heading"><span>译文</span>{translated && <div className="result-actions">
              <button className={`copy-button ${isSpeaking ? "speaking" : ""}`} onClick={toggleSpeech}>{isSpeaking ? "停止朗读" : "朗读译文"}</button>
              <button className="copy-button" onClick={copyResult}>{copied ? "已复制" : "复制译文"}</button>
            </div>}</div>
            <div className={`translated ${isTranslating ? "loading" : ""}`}>
              {isTranslating ? <><span className="loader" />正在翻译...</> : translated || <span className="placeholder">翻译结果将显示在这里</span>}
            </div>
          </div>
        </div>
        <button className="translate-button" disabled={!text.trim() || isTranslating} onClick={translate}>
          {isTranslating ? "翻译中..." : "开始翻译"} <span>→</span>
        </button>
      </section>
      <footer><span>由 AI 驱动</span><span>你的文本仅用于本次翻译</span></footer>
    </main>
  );
}
