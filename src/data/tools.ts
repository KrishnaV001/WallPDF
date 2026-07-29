// src/data/tools.ts

export interface Tool {
  slug: string;
  title: string;
  h1: string;
  description: string;
  category: string;
  color: string;
}

export const tools: Tool[] = [
  {
    slug: 'merge-pdf',
    title: 'Merge PDF',
    h1: 'Merge PDF Files',
    description: 'Combine multiple PDFs into one unified document in seconds.',
    category: 'Organize PDF',
    color: 'red',
  },
  {
    slug: 'split-pdf',
    title: 'Split PDF',
    h1: 'Split PDF Document',
    description: 'Separate one PDF into individual pages or page ranges.',
    category: 'Organize PDF',
    color: 'orange',
  },
  {
    slug: 'compress-pdf',
    title: 'Compress PDF',
    h1: 'Compress PDF File',
    description: 'Reduce file size while optimizing for maximal quality.',
    category: 'Optimize PDF',
    color: 'green',
  },
  {
    slug: 'pdf-to-powerpoint',
    title: 'PDF to PowerPoint',
    h1: 'PDF to PowerPoint',
    description: 'Turn your PDF files into easy to edit PPT and PPTX slideshows.',
    category: 'Convert PDF',
    color: 'orange',
  },
  {
    slug: 'edit-pdf',
    title: 'Edit PDF',
    h1: 'Edit PDF Document',
    description: 'Add text, shapes, comments and highlights to your PDF.',
    category: 'Edit PDF',
    color: 'purple',
  }
];