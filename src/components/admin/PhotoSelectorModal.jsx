import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaSearch, FaImage } from 'react-icons/fa';
import { loadPhotosManifest } from '../../utils/manifestLoader';
import { Blurhash } from 'react-blurhash';

const PhotoSelectorModal = ({ isOpen, onClose, onSelect }) => {
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            loadPhotosManifest()
                .then(data => {
                    setPhotos(data);
                    setLoading(false);
                })
                .catch(err => {
                    console.error('Failed to load photos:', err);
                    setLoading(false);
                });
        }
    }, [isOpen]);

    const filteredPhotos = useMemo(() => {
        if (!searchTerm) return photos;
        const lower = searchTerm.toLowerCase();
        return photos.filter(p =>
            (p.title && p.title.toLowerCase().includes(lower)) ||
            (p.description && p.description.toLowerCase().includes(lower)) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(lower)))
        );
    }, [photos, searchTerm]);

    // Handle click outside to close
    const handleBackdropClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                onClick={handleBackdropClick}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="bg-gray-900 border border-gray-700 w-full max-w-6xl h-[85vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            <span className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                                <FaImage />
                            </span>
                            選擇 NAS 照片
                            <span className="text-sm font-normal text-gray-500 ml-2">
                                {photos.length} 張照片
                            </span>
                        </h3>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white"
                        >
                            <FaTimes size={20} />
                        </button>
                    </div>

                    {/* Search Bar */}
                    <div className="p-4 bg-gray-800/30 border-b border-gray-800">
                        <div className="relative max-w-md">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜尋照片標題、描述或標籤..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-white pl-10 pr-4 py-2.5 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-gray-500"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Grid Content */}
                    <div className="flex-1 overflow-y-auto p-6 bg-gray-900 custom-scrollbar">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
                                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-500"></div>
                                <p>正在從 NAS 讀取照片...</p>
                            </div>
                        ) : filteredPhotos.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-2">
                                <FaImage size={40} className="opacity-20" />
                                <p>沒有找到符合的照片</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-4">
                                {filteredPhotos.map((photo) => {
                                    // Determine display date
                                    const dateStr = photo.exif?.DateTimeOriginal?.split(' ')[0]
                                        ? photo.exif.DateTimeOriginal.split(' ')[0].replace(/:/g, '/')
                                        : '';

                                    return (
                                        <div
                                            key={photo.id}
                                            onClick={() => onSelect(photo)}
                                            className="group relative aspect-[4/3] rounded-xl overflow-hidden cursor-pointer border border-gray-800 hover:border-purple-500 hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] transition-all duration-300 bg-gray-800"
                                        >
                                            {/* Blurhash Placeholder */}
                                            {!photo.thumbnailUrl && photo.blurhash && (
                                                <Blurhash
                                                    hash={photo.blurhash}
                                                    width="100%"
                                                    height="100%"
                                                    className="absolute inset-0 opacity-50"
                                                />
                                            )}

                                            {/* Image */}
                                            <img
                                                src={photo.thumbnailUrl}
                                                alt={photo.title}
                                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy"
                                                decoding="async"
                                            />

                                            {/* Overlay */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 transform translate-y-2 group-hover:translate-y-0">
                                                <p className="text-white text-sm font-semibold truncate leading-tight shadow-sm">{photo.title}</p>
                                                {dateStr && (
                                                    <p className="text-gray-300 text-xs mt-1 font-mono tracking-wide opacity-80">{dateStr}</p>
                                                )}
                                                <div className="mt-2 flex flex-wrap gap-1">
                                                    {photo.tags?.slice(0, 2).map(tag => (
                                                        <span key={tag} className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white backdrop-blur-sm">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Selection Indicator */}
                                            <div className="absolute top-2 right-2 bg-purple-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transform scale-50 group-hover:scale-100 transition-all shadow-lg">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-3 bg-gray-900 border-t border-gray-800 text-xs text-gray-500 flex justify-between px-5">
                        <span>來源: NAS Storage ({filteredPhotos.length} items)</span>
                        <span>點擊照片以插入文章</span>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default PhotoSelectorModal;
