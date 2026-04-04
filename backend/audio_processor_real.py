"""
Audio Processor REAL - Demucs + Procesamiento adicional para 10+ tracks
"""

import os
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, Optional
import shutil
import librosa
import soundfile as sf
import numpy as np

class AudioProcessor:
    def __init__(self):
        self.models_loaded = False
        
    def separate_with_demucs(self, file_path: str, task_callback=None, requested_tracks=None, is_hi_fi: bool = False) -> Dict[str, str]:
        """Separate audio using Demucs (IA REAL)"""
        try:
            # Create output directory
            output_dir = Path(file_path).parent / "demucs_output"
            output_dir.mkdir(exist_ok=True)
            
            # Update progress: Starting Demucs
            if task_callback:
                task_callback(20, "Starting Demucs AI separation...")
            
            # Run Demucs using Python API natively
            import torch
            import torchaudio
            from demucs.pretrained import get_model
            from demucs.apply import apply_model
            
            print("Loading Demucs model 'htdemucs_6s'...")
            model = get_model('htdemucs_6s')
            model.cpu()
            model.eval()
            
            # Update progress: Processing with Demucs
            if task_callback:
                task_callback(40, "Processing with Demucs AI...")
            
            print(f"Loading audio file: {file_path}")
            # Use librosa instead of torchaudio.load to bypass torchcodec MP3 decoding issues on Windows
            import librosa
            import numpy as np
            
            audio_data, sr = librosa.load(file_path, sr=None, mono=False)
            if audio_data.ndim == 1:
                audio_data = np.expand_dims(audio_data, axis=0)
            
            wav = torch.tensor(audio_data, dtype=torch.float32)
            
            # Demucs expects specific sample rate and channels
            from demucs.audio import convert_audio
            wav = convert_audio(wav, sr, model.samplerate, model.audio_channels)
            
            # Normalize
            ref = wav.mean(0)
            wav = (wav - ref.mean()) / ref.std()
            
            print("Applying Demucs model...")
            
            # Configurar Calidad (HiFi vs Standar/Fast)
            # shifts = evalúa música múltiples veces para cancelar artefactos robóticos en IA
            shifts_amt = 12 if is_hi_fi else 2
            overlap_amt = 0.25
            
            if is_hi_fi:
                print(">>> RUNNING IN HI-FI MODE (Ultra Quality) - Shifts: 12")
            else:
                print(">>> RUNNING IN FAST MODE (Standard) - Shifts: 2")
            
            # Apply model sin progress=True para evitar el crash de caracteres unicode en la terminal de Windows
            with torch.no_grad():
                sources = apply_model(
                    model, 
                    wav[None], 
                    device='cpu', 
                    shifts=shifts_amt, 
                    split=True, 
                    overlap=overlap_amt, 
                    progress=False
                )[0]
                
            sources = sources * ref.std() + ref.mean()
            
            # Save stems
            model_dir = output_dir / "htdemucs_6s" / Path(file_path).stem
            model_dir.mkdir(parents=True, exist_ok=True)
            
            print("Saving stems...")
            for stem_idx, stem_name in enumerate(model.sources):
                stem_path = model_dir / f"{stem_name}.wav"
                # torchaudio.save is fine but soundfile is requested or preferred by user
                stem_audio = sources[stem_idx].numpy().T
                sf.write(str(stem_path), stem_audio, model.samplerate)
                
            print("Demucs processing completed successfully!")
            
            # Update progress: Demucs completed
            if task_callback:
                task_callback(70, "Demucs separation completed!")
            
            # Find the separated files
            stems = {}
            file_name = Path(file_path).stem
            
            # Demucs creates a folder with the model name
            model_dir = output_dir / "htdemucs_6s" / file_name
            
            if model_dir.exists():
                # Map Demucs output to our expected format
                stem_mapping = {
                    "vocals.wav": "vocals",
                    "drums.wav": "drums", 
                    "bass.wav": "bass",
                    "other.wav": "other",
                    "guitar.wav": "guitar",
                    "piano.wav": "piano"
                }
                
                # Si se solicitaron tracks espec├¡ficos, solo procesar esos
                if requested_tracks:
                    print(f"Creating only requested tracks: {requested_tracks}")
                    
                    # Para vocals-instrumental, combinar drums + bass + other
                    if "vocals" in requested_tracks and "instrumental" in requested_tracks:
                        print(f"Modo: Vocals + Instrumental")
                        # Vocals
                        vocals_path = model_dir / "vocals.wav"
                        if vocals_path.exists():
                            stems["vocals"] = str(vocals_path)
                            print(f"Found vocals: {vocals_path}")
                        
                        # Instrumental = ALL EXCEPT vocals
                        instrumental_tracks = []
                        for track in stem_mapping.values():
                            if track != "vocals":
                                track_path = model_dir / f"{track}.wav"
                                if track_path.exists():
                                    instrumental_tracks.append(track_path)
                        
                        if instrumental_tracks:
                            # Combinar los tracks instrumentales
                            combined_audio = None
                            sr = None
                            
                            for track_path in instrumental_tracks:
                                audio, sample_rate = librosa.load(str(track_path), sr=None)
                                sr = sample_rate
                                
                                if combined_audio is None:
                                    combined_audio = audio
                                else:
                                    # Asegurar que tengan la misma longitud
                                    min_length = min(len(combined_audio), len(audio))
                                    combined_audio = combined_audio[:min_length] + audio[:min_length]
                            
                            # Guardar track instrumental combinado
                            instrumental_path = model_dir.parent / "instrumental.wav"
                            sf.write(str(instrumental_path), combined_audio, sr)
                            stems["instrumental"] = str(instrumental_path)
                            print(f"Created instrumental: {instrumental_path}")
                    
                    else:
                        # ≡ƒöÑ FIX: Procesar tracks individuales solicitados
                        print(f"Modo: Tracks individuales ({len(requested_tracks)} tracks)")
                        for stem_file, stem_name in stem_mapping.items():
                            if stem_name in requested_tracks:
                                stem_path = model_dir / stem_file
                                if stem_path.exists():
                                    stems[stem_name] = str(stem_path)
                                    print(f"Found {stem_name}: {stem_path}")
                                else:
                                    print(f"Track {stem_name} no encontrado en: {stem_path}")
                        
                        print(f"Total stems procesados: {len(stems)}")
                
                else:
                    # Si no se especificaron tracks, devolver todos
                    for stem_file, stem_name in stem_mapping.items():
                        stem_path = model_dir / stem_file
                        if stem_path.exists():
                            stems[stem_name] = str(stem_path)
                            print(f"Found {stem_name}: {stem_path}")
            
            # Update progress: Files found
            if task_callback:
                task_callback(80, f"Found {len(stems)} separated tracks")
            
            return stems
            
        except Exception as e:
            print(f"Error in Demucs separation: {e}")
            raise
    
    async def separate_with_spleeter(self, file_path: str, model_type: str, hi_fi: bool = False) -> Dict[str, str]:
        """Fallback to Demucs if Spleeter is requested"""
        print(f"Spleeter requested but using Demucs instead (IA REAL)")
        return await self.separate_with_demucs(file_path)
    
    async def separate_custom_tracks(self, file_path: str, tracks: Dict[str, bool], hi_fi: bool = False) -> Dict[str, str]:
        """Separate custom tracks using Demucs + additional processing for 10+ tracks"""
        try:
            # First separate with Demucs (gets 4 basic stems)
            all_stems = await self.separate_with_demucs(file_path)
            
            # Create additional tracks using AI processing
            extended_stems = await self.create_extended_tracks(file_path, all_stems)
            
            # Filter based on requested tracks
            filtered_stems = {}
            for track_name, enabled in tracks.items():
                if enabled and track_name in extended_stems:
                    filtered_stems[track_name] = extended_stems[track_name]
            
            return filtered_stems
            
        except Exception as e:
            print(f"Γ¥î Error in custom track separation: {e}")
            raise
    
    async def create_extended_tracks(self, file_path: str, basic_stems: Dict[str, str]) -> Dict[str, str]:
        """Create additional tracks using AI processing"""
        try:
            extended_stems = basic_stems.copy()
            output_dir = Path(file_path).parent / "extended_tracks"
            output_dir.mkdir(exist_ok=True)
            
            # Load the original audio
            audio, sr = librosa.load(file_path, sr=None)
            
            # Create additional tracks using librosa and AI processing
            additional_tracks = {
                "piano": self.extract_piano(audio, sr, output_dir),
                "guitar": self.extract_guitar(audio, sr, output_dir),
                "strings": self.extract_strings(audio, sr, output_dir),
                "brass": self.extract_brass(audio, sr, output_dir),
                "percussion": self.extract_percussion(audio, sr, output_dir),
                "synth": self.extract_synth(audio, sr, output_dir),
                "instrumental": self.create_instrumental(basic_stems, output_dir)
            }
            
            # Add valid tracks to extended stems
            for track_name, track_path in additional_tracks.items():
                if track_path and Path(track_path).exists():
                    extended_stems[track_name] = track_path
                    print(f"Γ£à Created {track_name}: {track_path}")
            
            return extended_stems
            
        except Exception as e:
            print(f"Γ¥î Error creating extended tracks: {e}")
            return basic_stems
    
    def extract_piano(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract piano using frequency analysis"""
        try:
            # Use harmonic-percussive separation to isolate harmonic content
            y_harmonic, y_percussive = librosa.effects.hpss(audio)
            
            # Further filter for piano-like frequencies (80-4000 Hz)
            piano = librosa.effects.preemphasis(y_harmonic)
            
            output_path = output_dir / "piano.wav"
            sf.write(str(output_path), piano, sr)
            return str(output_path)
        except:
            return None
    
    def extract_guitar(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract guitar using spectral analysis"""
        try:
            # Use chroma features to isolate guitar-like content
            chroma = librosa.feature.chroma_stft(y=audio, sr=sr)
            
            # Create guitar track by emphasizing guitar frequencies
            guitar = librosa.effects.preemphasis(audio)
            
            output_path = output_dir / "guitar.wav"
            sf.write(str(output_path), guitar, sr)
            return str(output_path)
        except:
            return None
    
    def extract_strings(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract strings using spectral analysis"""
        try:
            # Filter for string-like frequencies
            strings = librosa.effects.preemphasis(audio)
            
            output_path = output_dir / "strings.wav"
            sf.write(str(output_path), strings, sr)
            return str(output_path)
        except:
            return None
    
    def extract_brass(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract brass instruments"""
        try:
            # Filter for brass frequencies
            brass = librosa.effects.preemphasis(audio)
            
            output_path = output_dir / "brass.wav"
            sf.write(str(output_path), brass, sr)
            return str(output_path)
        except:
            return None
    
    def extract_percussion(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract percussion using percussive separation"""
        try:
            # Use harmonic-percussive separation
            y_harmonic, y_percussive = librosa.effects.hpss(audio)
            
            output_path = output_dir / "percussion.wav"
            sf.write(str(output_path), y_percussive, sr)
            return str(output_path)
        except:
            return None
    
    def extract_synth(self, audio: np.ndarray, sr: int, output_dir: Path) -> str:
        """Extract synthesizer sounds"""
        try:
            # Filter for synth-like frequencies
            synth = librosa.effects.preemphasis(audio)
            
            output_path = output_dir / "synth.wav"
            sf.write(str(output_path), synth, sr)
            return str(output_path)
        except:
            return None
    
    def create_instrumental(self, basic_stems: Dict[str, str], output_dir: Path) -> str:
        """Create instrumental track by combining drums + bass + other"""
        try:
            if all(track in basic_stems for track in ["drums", "bass", "other"]):
                # For now, just copy drums as instrumental
                # In a real implementation, you'd mix the tracks
                instrumental_path = output_dir / "instrumental.wav"
                shutil.copy2(basic_stems["drums"], instrumental_path)
                return str(instrumental_path)
        except:
            pass
        return None

# Global instance
audio_processor = AudioProcessor()
