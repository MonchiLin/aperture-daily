import { CaretRightFilled, PauseOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import AudioVisualizer from './AudioVisualizer';

/**
 * 音频播放器组件
 * 纯表现层，依赖 useAudioPlayer Hook 处理核心逻辑
 */
export default function AudioPlayer() {
    const {
        state,
        audioRef,
        onTimeUpdate,
        onEnded,
        togglePlay,
        nextSpeed,
        restart
    } = useAudioPlayer();

    const { isPlaying, currentIndex, playlist, playbackRate, isLoading } = state;

    if (playlist.length === 0) return null;

    return (
        <div className="font-serif">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 border-b-2 border-slate-900 pb-2">
                <div className="text-xs font-bold uppercase tracking-widest text-slate-900">
                    Audio Edition
                </div>
                <div className="text-xs font-mono text-stone-500">
                    {playbackRate}x
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-4">
                <button
                    onClick={togglePlay}
                    disabled={isLoading}
                    className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-900 !text-white hover:bg-slate-700 transition-all shrink-0 disabled:opacity-50"
                >
                    {isPlaying ? <PauseOutlined className="text-xl" /> : <CaretRightFilled className="text-xl ml-1" />}
                </button>

                <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="text-sm font-bold text-slate-900 leading-none mb-1">
                        {isLoading ? 'Loading Audio...' : (isPlaying ? 'Now Playing' : 'Listen to Article')}
                    </div>
                    <div className="text-xs text-stone-500 font-serif italic truncate">
                        Section {currentIndex + 1} of {playlist.length}
                    </div>
                </div>

                <div className="flex gap-1">
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 text-stone-400 hover:text-slate-900 hover:border-slate-900 transition-all"
                        onClick={nextSpeed}
                        title="Speed"
                    >
                        <span className="text-[10px] font-bold">SPD</span>
                    </button>
                    <button
                        className="w-8 h-8 flex items-center justify-center rounded-full border border-stone-300 text-stone-400 hover:text-slate-900 hover:border-slate-900 transition-all"
                        onClick={restart}
                        title="Restart"
                    >
                        <ReloadOutlined className="text-xs" />
                    </button>
                </div>
            </div>

            {/* Waveform */}
            <div className="mt-4 opacity-50">
                <AudioVisualizer isPlaying={isPlaying && !isLoading} />
            </div>

            {/* Hidden Audio Element */}
            <audio
                ref={audioRef}
                onTimeUpdate={onTimeUpdate}
                onEnded={onEnded}
                className="hidden"
            />
        </div>
    );
}
