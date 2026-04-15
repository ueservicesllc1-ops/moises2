import librosa
import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import scipy.ndimage

@dataclass
class ChordResult:
    chord: str
    confidence: float
    start_time: float
    end_time: float
    root_note: str
    chord_type: str

@dataclass
class KeyResult:
    key: str
    mode: str
    confidence: float
    tonic: str

class ChordAnalyzer:
    def __init__(self):
        self.note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        self.chord_templates = self._generate_templates()
        self.hop_length = 512
        self.min_segment_duration = 0.35
        self.genre_profiles = {
            "default": {"transition_penalty": 0.055, "stay_bonus": 0.016, "median_size": 9},
            "pop": {"transition_penalty": 0.060, "stay_bonus": 0.018, "median_size": 11},
            "rock": {"transition_penalty": 0.058, "stay_bonus": 0.017, "median_size": 9},
            "jazz": {"transition_penalty": 0.040, "stay_bonus": 0.011, "median_size": 7},
            "acoustic": {"transition_penalty": 0.062, "stay_bonus": 0.019, "median_size": 11},
        }
        self.default_genre = "default"

    def _generate_templates(self) -> Dict[str, List[int]]:
        """
        Plantillas más completas y con pesos.
        Se incluye información de triadas y cuatríadas más comunes.
        """
        templates = {}
        patterns: Dict[str, Tuple[List[int], List[float], str]] = {
            "": ([0, 4, 7], [1.0, 0.9, 0.8], "major"),
            "m": ([0, 3, 7], [1.0, 0.9, 0.8], "minor"),
            "7": ([0, 4, 7, 10], [1.0, 0.88, 0.78, 0.62], "dominant7"),
            "maj7": ([0, 4, 7, 11], [1.0, 0.88, 0.78, 0.62], "major7"),
            "m7": ([0, 3, 7, 10], [1.0, 0.88, 0.78, 0.62], "minor7"),
            "9": ([0, 4, 7, 10, 2], [1.0, 0.84, 0.74, 0.56, 0.42], "dominant9"),
            "maj9": ([0, 4, 7, 11, 2], [1.0, 0.84, 0.74, 0.56, 0.42], "major9"),
            "m9": ([0, 3, 7, 10, 2], [1.0, 0.84, 0.74, 0.56, 0.42], "minor9"),
            "11": ([0, 4, 7, 10, 2, 5], [1.0, 0.82, 0.72, 0.54, 0.36, 0.30], "dominant11"),
            "13": ([0, 4, 7, 10, 2, 9], [1.0, 0.82, 0.72, 0.54, 0.36, 0.30], "dominant13"),
            "sus2": ([0, 2, 7], [1.0, 0.82, 0.75], "sus2"),
            "sus4": ([0, 5, 7], [1.0, 0.82, 0.75], "sus4"),
            "dim": ([0, 3, 6], [1.0, 0.86, 0.72], "diminished"),
            "aug": ([0, 4, 8], [1.0, 0.86, 0.72], "augmented"),
            "5": ([0, 7], [1.0, 0.78], "power"),
        }

        for i, note in enumerate(self.note_names):
            for suffix, (intervals, weights, _kind) in patterns.items():
                tpl = [0.0] * 12
                for interval, weight in zip(intervals, weights):
                    tpl[(i + interval) % 12] = weight
                templates[f"{note}{suffix}"] = tpl

        return templates

    def _estimate_bass_pitch_class(self, y: np.ndarray, sr: int, start_t: float, end_t: float) -> Optional[int]:
        try:
            s = max(0, int(start_t * sr))
            e = min(len(y), int(end_t * sr))
            if e - s < int(0.08 * sr):
                return None
            seg = y[s:e]
            if np.max(np.abs(seg)) < 1e-4:
                return None
            pitches, mags = librosa.piptrack(y=seg, sr=sr, fmin=35, fmax=220, hop_length=512)
            if pitches.size == 0:
                return None
            mask = mags > (np.percentile(mags, 87) if np.any(mags) else 0)
            strong = pitches[mask]
            if strong.size == 0:
                return None
            midi = librosa.hz_to_midi(np.clip(strong, 35.0, 2000.0))
            midi = midi[np.isfinite(midi)]
            if midi.size == 0:
                return None
            pc = int(np.round(np.median(midi)) % 12)
            return pc
        except Exception:
            return None

    def analyze_chords(self, file_path: str, genre: str = "default") -> List[ChordResult]:
        """Análisis pro de acordes usando HPSS + CQT/STFT + suavizado temporal."""
        try:
            print(f"[CHORD] Starting analysis for: {file_path}")
            y, sr = librosa.load(file_path, sr=22050)
            if len(y) == 0:
                return []
            profile = self.genre_profiles.get((genre or "default").lower(), self.genre_profiles[self.default_genre])

            y_harmonic, _ = librosa.effects.hpss(y)

            chroma_cqt = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=self.hop_length)
            chroma_stft = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, hop_length=self.hop_length)
            chroma = (0.72 * chroma_cqt) + (0.28 * chroma_stft)

            # Suavizado temporal para evitar saltos bruscos
            chroma = scipy.ndimage.median_filter(chroma, size=(1, int(profile["median_size"])))
            chroma = scipy.ndimage.gaussian_filter(chroma, sigma=(0.0, 1.15))

            # Normalización por frame
            frame_energy = np.linalg.norm(chroma, axis=0) + 1e-8
            chroma = chroma / frame_energy[None, :]

            n_frames = chroma.shape[1]
            total_duration = len(y) / sr
            if n_frames == 0:
                return []

            frame_time = total_duration / n_frames

            chord_names = list(self.chord_templates.keys())
            template_matrix = np.array([self.chord_templates[name] for name in chord_names], dtype=np.float32)
            template_matrix = template_matrix / (np.linalg.norm(template_matrix, axis=1, keepdims=True) + 1e-8)

            # Similaridad coseno por frame (n_chords, n_frames)
            scores = np.matmul(template_matrix, chroma)

            # Decodificación temporal estilo Viterbi (penaliza cambios muy frecuentes)
            transition_penalty = float(profile["transition_penalty"])
            stay_bonus = float(profile["stay_bonus"])
            n_chords = len(chord_names)
            dp = np.zeros((n_chords, n_frames), dtype=np.float32)
            back = np.zeros((n_chords, n_frames), dtype=np.int32)
            dp[:, 0] = scores[:, 0]

            for t in range(1, n_frames):
                prev = dp[:, t - 1]
                for c in range(n_chords):
                    trans = prev - transition_penalty
                    trans[c] = prev[c] + stay_bonus
                    best_prev = int(np.argmax(trans))
                    dp[c, t] = scores[c, t] + trans[best_prev]
                    back[c, t] = best_prev

            states = np.zeros(n_frames, dtype=np.int32)
            states[-1] = int(np.argmax(dp[:, -1]))
            for t in range(n_frames - 2, -1, -1):
                states[t] = back[states[t + 1], t + 1]

            # Compactar frames contiguos con el mismo acorde
            raw_chords: List[ChordResult] = []
            start_idx = 0
            curr_state = states[0]

            def infer_chord_type(name: str) -> str:
                core = name.split('/')[0]
                if core.endswith('maj9'):
                    return 'major9'
                if core.endswith('m9'):
                    return 'minor9'
                if core.endswith('13'):
                    return 'dominant13'
                if core.endswith('11'):
                    return 'dominant11'
                if core.endswith('9'):
                    return 'dominant9'
                if core.endswith('maj7'):
                    return 'major7'
                if core.endswith('m7'):
                    return 'minor7'
                if core.endswith('7'):
                    return 'dominant7'
                if core.endswith('sus2'):
                    return 'sus2'
                if core.endswith('sus4'):
                    return 'sus4'
                if core.endswith('dim'):
                    return 'diminished'
                if core.endswith('aug'):
                    return 'augmented'
                if core.endswith('5'):
                    return 'power'
                if core.endswith('m'):
                    return 'minor'
                return 'major'

            def infer_root(name: str) -> str:
                ordered = sorted(self.note_names, key=len, reverse=True)
                for root in ordered:
                    if name.startswith(root):
                        return root
                return name[:1] if name else "C"

            for i in range(1, n_frames + 1):
                is_break = i == n_frames or states[i] != curr_state
                if not is_break:
                    continue

                chord_name = chord_names[curr_state]
                seg_scores = scores[curr_state, start_idx:i]
                confidence = float(np.clip(np.mean(seg_scores), 0.0, 1.0))
                start_t = float(start_idx * frame_time)
                end_t = float(min(total_duration, i * frame_time))
                root = infer_root(chord_name)
                bass_pc = self._estimate_bass_pitch_class(y, sr, start_t, end_t)
                if bass_pc is not None and self.note_names[bass_pc] != root:
                    chord_name = f"{chord_name}/{self.note_names[bass_pc]}"

                raw_chords.append(
                    ChordResult(
                        chord=chord_name,
                        confidence=confidence,
                        start_time=start_t,
                        end_time=end_t,
                        root_note=root,
                        chord_type=infer_chord_type(chord_name),
                    )
                )

                if i < n_frames:
                    start_idx = i
                    curr_state = states[i]

            if not raw_chords:
                return []

            # Fusiona segmentos muy cortos con el vecino más estable
            final_chords: List[ChordResult] = []
            for chord in raw_chords:
                duration = chord.end_time - chord.start_time
                if duration < self.min_segment_duration and final_chords:
                    prev = final_chords[-1]
                    if prev.confidence >= chord.confidence:
                        prev.end_time = chord.end_time
                        prev.confidence = float((prev.confidence + chord.confidence) / 2.0)
                        continue
                else:
                    if final_chords and final_chords[-1].chord == chord.chord:
                        final_chords[-1].end_time = chord.end_time
                        final_chords[-1].confidence = float((final_chords[-1].confidence + chord.confidence) / 2.0)
                    else:
                        final_chords.append(chord)

            return final_chords
        except Exception as e:
            print(f"[CHORD] Error in analyze_chords: {e}")
            return []

    def analyze_key(self, file_path: str) -> Optional[KeyResult]:
        """Detecta tonalidad principal usando perfiles mayor/menor con croma combinado."""
        try:
            y, sr = librosa.load(file_path, sr=22050, duration=75)
            if len(y) == 0:
                return None

            y_harmonic, _ = librosa.effects.hpss(y)
            chroma_cqt = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=self.hop_length)
            chroma_stft = librosa.feature.chroma_stft(y=y_harmonic, sr=sr, hop_length=self.hop_length)
            chroma = (0.72 * chroma_cqt) + (0.28 * chroma_stft)
            chroma = scipy.ndimage.gaussian_filter(chroma, sigma=(0.0, 1.0))
            avg_chroma = np.mean(chroma, axis=1)
            avg_chroma = avg_chroma / (np.sum(avg_chroma) + 1e-8)

            # Krumhansl-Schmuckler profiles
            major_p = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor_p = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

            major_p = major_p / np.linalg.norm(major_p)
            minor_p = minor_p / np.linalg.norm(minor_p)

            best_k = "C"
            best_m = "major"
            best_s = -1.0

            for i in range(12):
                profile_maj = np.roll(major_p, i)
                profile_min = np.roll(minor_p, i)
                s_maj = float(np.dot(avg_chroma, profile_maj) / (np.linalg.norm(avg_chroma) + 1e-8))
                s_min = float(np.dot(avg_chroma, profile_min) / (np.linalg.norm(avg_chroma) + 1e-8))

                if s_maj > best_s:
                    best_s = s_maj
                    best_k = self.note_names[i]
                    best_m = "major"
                if s_min > best_s:
                    best_s = s_min
                    best_k = self.note_names[i]
                    best_m = "minor"

            return KeyResult(
                key=best_k,
                mode=best_m,
                confidence=float(np.clip(best_s, 0.0, 1.0)),
                tonic=best_k
            )
        except Exception:
            return None
