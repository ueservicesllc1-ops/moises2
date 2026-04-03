/**
 * AudioSeparationModal - Modal para seleccionar opciones de separación de audio
 */

import React, { useState } from 'react';
import { X, ArrowUpDown, Mic, Guitar, Music, Drum, Lock, Zap } from 'lucide-react';


interface AudioSeparationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (separationOptions: SeparationOptions) => void;
  songData?: any;
  isProcessing?: boolean;
}

interface SeparationOptions {
  type: 'basic' | 'custom';
  basicType?: 'vocals-instrumental' | 'vocals-drums-bass-other';
  customTracks: {
    vocals: boolean;
    guitar: boolean;
    bass: boolean;
    drums: boolean;
  };
  hiFiMode: boolean;
}

const AudioSeparationModal: React.FC<AudioSeparationModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave,
  songData,
  isProcessing = false
}) => {
  const [separationType, setSeparationType] = useState<'basic' | 'custom'>('basic');
  const [basicType, setBasicType] = useState<'vocals-instrumental' | 'vocals-drums-bass-other'>('vocals-drums-bass-other');
  const [customTracks, setCustomTracks] = useState({
    vocals: true,
    guitar: false,
    bass: false,
    drums: false,
  });
  const [hiFiMode, setHiFiMode] = useState(false);

  const handleSave = () => {
    const options: SeparationOptions = {
      type: separationType,
      basicType: separationType === 'basic' ? basicType : undefined,
      customTracks,
      hiFiMode
    };
    
    onSave(options);
    // NO llamar onClose() aquí - el modal se cerrará cuando se complete el procesamiento
  };

  const toggleCustomTrack = (track: keyof typeof customTracks) => {
    setCustomTracks(prev => ({
      ...prev,
      [track]: !prev[track]
    }));
    
    // Si se activa algún track custom, cambiar a modo custom
    if (!customTracks[track]) {
      setSeparationType('custom');
    }
  };

  const isCustomTrackEnabled = (track: keyof typeof customTracks) => {
    return customTracks[track];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">

      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Separate tracks</h2>
            {songData && (
              <div className="text-sm text-gray-300 mt-1">
                🎵 {songData.artist} - {songData.title}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Basic Separation */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Basic separation</h3>
          
          <div className="space-y-3">
            {/* Vocals, Drums, Bass, Other */}
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                separationType === 'basic' && basicType === 'vocals-drums-bass-other'
                  ? 'border-green-500 bg-green-500/20' 
                  : separationType === 'custom'
                  ? 'border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
              }`}
              onClick={() => {
                if (separationType !== 'custom') {
                  setSeparationType('basic');
                  setBasicType('vocals-drums-bass-other');
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ArrowUpDown className={`h-5 w-5 ${
                    separationType === 'basic' && basicType === 'vocals-drums-bass-other'
                      ? 'text-green-400'
                      : 'text-gray-400'
                  }`} />
                  <div>
                    <div className={`font-medium ${
                      separationType === 'basic' && basicType === 'vocals-drums-bass-other'
                        ? 'text-white'
                        : 'text-gray-300'
                    }`}>Vocals, Drums, Bass, Other</div>
                    <div className="text-gray-400 text-sm">Separate into 4 tracks (Demucs)</div>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full transition-all ${
                  separationType === 'basic' && basicType === 'vocals-drums-bass-other'
                    ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                    : 'bg-gray-600'
                }`}></div>
              </div>
            </div>

            {/* Vocals, Instrumental */}
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                separationType === 'basic' && basicType === 'vocals-instrumental'
                  ? 'border-green-500 bg-green-500/20' 
                  : separationType === 'custom'
                  ? 'border-gray-700 bg-gray-800/50 opacity-50 cursor-not-allowed'
                  : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
              }`}
              onClick={() => {
                if (separationType !== 'custom') {
                  setSeparationType('basic');
                  setBasicType('vocals-instrumental');
                }
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <ArrowUpDown className={`h-5 w-5 ${
                    separationType === 'basic' && basicType === 'vocals-instrumental'
                      ? 'text-green-400'
                      : 'text-gray-400'
                  }`} />
                  <div>
                    <div className={`font-medium ${
                      separationType === 'basic' && basicType === 'vocals-instrumental'
                        ? 'text-white'
                        : 'text-gray-300'
                    }`}>Vocals, Instrumental</div>
                    <div className="text-gray-400 text-sm">Separate into 2 tracks (Spleeter)</div>
                  </div>
                </div>
                <div className={`w-3 h-3 rounded-full transition-all ${
                  separationType === 'basic' && basicType === 'vocals-instrumental'
                    ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                    : 'bg-gray-600'
                }`}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Separation */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 mb-3">
            <h3 className="text-lg font-semibold text-white">Custom separation</h3>
            <div className="w-4 h-4 bg-gray-600 rounded-full flex items-center justify-center">
              <span className="text-xs text-gray-300">i</span>
            </div>
          </div>

          <div 
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all mb-4 ${
              separationType === 'custom'
                ? 'border-green-500 bg-green-500/20' 
                : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
            }`}
            onClick={() => setSeparationType('custom')}
          >
            <div className="flex items-center justify-between">
              <div className={`font-medium ${
                separationType === 'custom' ? 'text-white' : 'text-gray-300'
              }`}>Select individual tracks (Demucs)</div>
              <div className={`w-3 h-3 rounded-full transition-all ${
                separationType === 'custom'
                  ? 'bg-green-500 shadow-lg shadow-green-500/50 animate-pulse'
                  : 'bg-gray-600'
              }`}></div>
            </div>
          </div>

          {separationType === 'custom' && (
            <div className="space-y-3 pl-4">
              {/* Vocals */}
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Mic className="h-5 w-5 text-gray-300" />
                  <span className="text-white">Vocals</span>
                </div>
                <div className="flex items-center space-x-2">
                  <select 
                    className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                    value={isCustomTrackEnabled('vocals') ? 'enabled' : 'disabled'}
                    onChange={(e) => toggleCustomTrack('vocals')}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {/* Guitar */}
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Guitar className="h-5 w-5 text-gray-300" />
                  <span className="text-white">Guitar</span>
                </div>
                <div className="flex items-center space-x-2">
                  <select 
                    className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                    value={isCustomTrackEnabled('guitar') ? 'enabled' : 'disabled'}
                    onChange={(e) => toggleCustomTrack('guitar')}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {/* Bass */}
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Music className="h-5 w-5 text-gray-300" />
                  <span className="text-white">Bass</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Lock className="h-4 w-4 text-yellow-500" />
                  <span className="text-yellow-500 text-sm">Premium</span>
                </div>
              </div>

              {/* Drums */}
              <div className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-3">
                  <Drum className="h-5 w-5 text-gray-300" />
                  <span className="text-white">Drums</span>
                </div>
                <div className="flex items-center space-x-2">
                  <select 
                    className="bg-gray-600 text-white px-2 py-1 rounded text-sm"
                    value={isCustomTrackEnabled('drums') ? 'enabled' : 'disabled'}
                    onChange={(e) => toggleCustomTrack('drums')}
                  >
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* HI-FI Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg mb-6">
          <div className="flex items-center space-x-3">
            <Zap className="h-5 w-5 text-gray-300" />
            <span className="text-white font-medium">HI-FI</span>
          </div>
          <button
            onClick={() => setHiFiMode(!hiFiMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              hiFiMode ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                hiFiMode ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={isProcessing}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Processing...</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
              </div>
              <span>Save</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AudioSeparationModal;

