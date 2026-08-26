'use client';

import React, { useState } from 'react';
import { FileText, Printer, Download, X, Check, Copy } from 'lucide-react';
import type { GeneratedDocument } from '@/lib/intelligence/dossier-builder';
import type { AutomatedCaseReconReport } from '@/lib/intelligence/case-recon-engine';

interface DossierViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AutomatedCaseReconReport | null;
  documents: GeneratedDocument[];
}

export function DossierViewerModal({ isOpen, onClose, report, documents }: DossierViewerModalProps) {
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report || documents.length === 0) return null;

  const currentDoc = documents[selectedDocIndex] || documents[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentDoc.plainText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${currentDoc.docTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
            body { font-family: 'Sarabun', sans-serif; padding: 40px; color: #000; font-size: 14pt; line-height: 1.6; }
            .indent-8 { text-indent: 2.5cm; }
            .text-justify { text-align: justify; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .font-bold { font-weight: bold; }
            .my-4 { margin-top: 1rem; margin-bottom: 1rem; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          ${currentDoc.contentHtml}
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-950 border border-slate-800 rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">ชุดแฟ้มสืบสวนและร่างหนังสือราชการ (1-Click Action Dossier)</h2>
              <p className="text-xs text-slate-400">สำนวนคดี: {report.caseNumber} - {report.caseTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Document Selector Tabs */}
        <div className="px-6 py-2 border-b border-slate-800 bg-slate-900/30 flex flex-wrap gap-2 overflow-x-auto">
          {documents.map((doc, idx) => (
            <button
              key={doc.docId}
              type="button"
              onClick={() => setSelectedDocIndex(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 ${
                selectedDocIndex === idx
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <span>{doc.docCategory === 'POLICE_DISPATCH_LETTER' ? '🚔' : doc.docCategory === 'INTERNAL_INVESTIGATION_MEMO' ? '📑' : '📋'}</span>
              <span className="truncate max-w-[240px]">{doc.docTitle}</span>
            </button>
          ))}
        </div>

        {/* Document Content View */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-900/20 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              ปลายทาง: {currentDoc.issuedTo}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'คัดลอกข้อความแล้ว' : 'คัดลอกข้อความ'}</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow transition cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>พิมพ์ / บันทึกเป็น PDF</span>
              </button>
            </div>
          </div>

          <div
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: currentDoc.contentHtml }}
          />
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-500">
          <span>ความมั่นคงปลอดภัย: เอกสารร่างจัดทำตาม พ.ร.บ.วิธีปฏิบัติราชการทางปกครอง และระเบียบสำนักนายกรัฐมนตรีฯ</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>

      </div>
    </div>
  );
}
