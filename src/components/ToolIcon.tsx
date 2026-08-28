import React from 'react';

interface ToolIconProps {
  slug: string;
  className?: string;
}

// Map each tool slug to its exact homepage SVG paths
export const ToolIcon: React.FC<ToolIconProps> = ({ slug, className = "w-6 h-6" }) => {
  switch (slug) {
    case 'merge-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
      );

    case 'split-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      );

    case 'compress-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 14 10 14 10 20" />
          <polyline points="20 10 14 10 14 4" />
          <line x1="14" y1="10" x2="21" y2="3" />
          <line x1="3" y1="21" x2="10" y2="14" />
        </svg>
      );

    case 'pdf-to-word':
    case 'word-to-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );

    case 'pdf-to-powerpoint':
    case 'powerpoint-to-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h20v14H2z" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
          <path d="M7 7h5a2 2 0 0 1 0 4H7V7z" />
        </svg>
      );

    case 'edit-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );

    case 'crop-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" />
          <path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
        </svg>
      );

    case 'image-to-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );

    case 'pdf-to-excel':
    case 'excel-to-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="13" x2="16" y2="19" />
          <line x1="16" y1="13" x2="8" y2="19" />
        </svg>
      );

    case 'pdf-to-images':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="7" width="14" height="14" rx="2" />
          <circle cx="12.5" cy="12.5" r="1.25" />
          <polyline points="21 17 17 13 10 20" />
          <path d="M5 17H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v1" />
        </svg>
      );

    case 'rotate-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 3H6a2 2 0 0 0-2 2v3" />
          <path d="M15 21h3a2 2 0 0 0 2-2v-3" />
          <rect x="8" y="8" width="8" height="8" rx="1.5" />
          <path d="M20.5 6.5a8 8 0 0 0-13-3.5" />
          <polyline points="7.5 3 7.5 6.5 4 6.5" />
        </svg>
      );

    case 'watermark-pdf':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <text x="7" y="18" fontSize="8" fontWeight="700" stroke="none" fill="currentColor" opacity="0.55">W</text>
        </svg>
      );

    case 'add-page-numbers':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8" y1="12" x2="14" y2="12" />
          <line x1="8" y1="15.5" x2="12" y2="15.5" />
          <circle cx="16.5" cy="18.5" r="2.5" fill="currentColor" stroke="none" opacity="0.15" />
          <text x="15" y="20" fontSize="4.5" fontWeight="700" stroke="none" fill="currentColor">12</text>
        </svg>
      );

    case 'compress-image':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5-6 6" />
          <polyline points="16 21 21 21 21 16" />
          <polyline points="8 3 3 3 3 8" />
        </svg>
      );

    case 'jpg-to-png':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" />
          <polyline points="17 3 18.7 6.7 15 8" />
          <polyline points="7 21 5.3 17.3 9 16" />
        </svg>
      );

    // Default Fallback PDF Icon
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
};