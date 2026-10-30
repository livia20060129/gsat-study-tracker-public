export type VocabularyAccent = 'en-US' | 'en-GB';

export function preferredSpeechVoice(voices: readonly SpeechSynthesisVoice[], accent: VocabularyAccent): SpeechSynthesisVoice | undefined {
  const matching = voices.filter(voice => voice.lang.replace('_', '-').toLowerCase() === accent.toLowerCase());
  return matching.find(voice => voice.localService) ?? matching[0];
}

export class VocabularySpeech {
  private utterance: SpeechSynthesisUtterance | null = null;
  private button: HTMLButtonElement | null = null;
  private readonly status: HTMLElement;

  constructor(status: HTMLElement) { this.status = status; }

  get supported(): boolean {
    return typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function';
  }

  cancel(): void {
    this.utterance = null;
    this.button?.setAttribute('aria-pressed', 'false');
    this.button = null;
    if (this.supported) window.speechSynthesis.cancel();
  }

  speak(text: string, accent: VocabularyAccent, button: HTMLButtonElement): void {
    if (!this.supported) { this.status.textContent = '此瀏覽器不支援發音，可點英文查看 Oxford。'; return; }
    const wasPlaying = this.button === button;
    this.cancel();
    if (wasPlaying) { this.status.textContent = '已停止發音。'; return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = accent;
    utterance.rate = 0.9;
    const voice = preferredSpeechVoice(window.speechSynthesis.getVoices(), accent);
    if (voice) utterance.voice = voice;
    this.utterance = utterance;
    this.button = button;
    button.setAttribute('aria-pressed', 'true');
    this.status.textContent = `正在朗讀 ${text}（${accent === 'en-US' ? '美式' : '英式'}）。`;
    utterance.onend = () => {
      if (this.utterance !== utterance) return;
      this.utterance = null;
      this.button = null;
      button.setAttribute('aria-pressed', 'false');
      this.status.textContent = '';
    };
    utterance.onerror = () => {
      if (this.utterance !== utterance) return;
      this.cancel();
      this.status.textContent = '目前無法播放發音，請確認裝置的英文語音設定，或點英文查看 Oxford。';
    };
    try { window.speechSynthesis.speak(utterance); }
    catch { utterance.onerror?.(new Event('error') as SpeechSynthesisErrorEvent); }
  }
}
