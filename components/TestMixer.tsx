/**
 * TestMixer - Mixer de prueba simple
 */

import React from 'react';
import { ArrowLeft, Music } from 'lucide-react';

interface TestMixerProps {
  isOpen: boolean;
  onClose: () => void;
  songData: any;
}

const TestMixer: React.FC<TestMixerProps> = ({ isOpen, onClose, songData }) => {
  if (!isOpen || !songData) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 flex flex-col">
      {/* Top Header */}
      <div className="bg-gray-800 h-16 flex items-center justify-between px-6 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Music className="h-5 w-5 text-blue-400" />
          <span className="text-white font-medium">{songData.title}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <Music className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-medium text-white mb-2">Test Mixer</h3>
          <p className="text-gray-400 mb-6">Este es un mixer de prueba.</p>
          <p className="text-gray-500 text-sm">Song: {songData.title}</p>
        </div>
      </div>
    </div>
  );
};

export default TestMixer;
