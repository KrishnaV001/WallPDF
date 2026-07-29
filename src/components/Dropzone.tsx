import React, { useState, useCallback } from 'react';
import { Upload, ShieldCheck, FileUp } from 'lucide-react';

interface DropzoneProps {
  onFilesSelected: (files: File[]) => void;
  acceptMultiple?: boolean;
}

export const Dropzone: React.FC<DropzoneProps> = ({ onFilesSelected, acceptMultiple = true }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter((f) => f.type === 'application/pdf');
      if (files.length > 0) onFilesSelected(files);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 p-12 text-center cursor-pointer ${
        isDragging
          ? 'border-rose-400 bg-rose-50 shadow-xl scale-[1.01]'
          : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/50 shadow-sm'
      }`}
    >
      <input
        type="file"
        accept="application/pdf"
        multiple={acceptMultiple}
        onChange={handleFileInput}
        className="hidden"
        id="file-upload"
      />
      <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center space-y-4">
        <div
          className={`p-4 rounded-2xl transition-all duration-300 ${
            isDragging ? 'bg-rose-600 text-white scale-110' : 'bg-slate-100 text-rose-500'
          }`}
        >
          {isDragging ? <FileUp className="w-8 h-8 animate-bounce" /> : <Upload className="w-8 h-8" />}
        </div>

        <div className="space-y-1">
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">
            Drop your PDF files here
          </h3>
          <p className="text-sm text-slate-500">
            or <span className="text-rose-600 font-semibold underline underline-offset-4">click to browse</span> from your computer
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>End-to-End Private • Processed Locally</span>
        </div>
      </label>
    </div>
  );
};