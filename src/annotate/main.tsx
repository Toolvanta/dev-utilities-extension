import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, Circle, Download, Eraser, Minus, MousePointer2, Pencil, Redo2, Square, Type, Undo2 } from 'lucide-react';
import { Button, IconButton, Input, Notice, Segmented, ToolHeader } from '../components/ui';
import { getLocal } from '../lib/storage';
import { downloadDataUrl, timestampName } from '../lib/utils';
import '../app/styles.css';

type Tool = 'select' | 'free' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'blur' | 'highlight';

export function AnnotatePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const framesRef = useRef<ImageData[]>([]);
  const frameIndexRef = useRef(-1);
  const drawingRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState('#ef4444');
  const [width, setWidth] = useState(4);
  const [fontSize, setFontSize] = useState(28);
  const [text, setText] = useState('Look here');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);

  const canvas = () => canvasRef.current;
  const context = () => canvas()?.getContext('2d') || null;

  const snapshot = () => {
    const ctx = context();
    const element = canvas();
    if (!ctx || !element) return;
    framesRef.current = framesRef.current.slice(0, frameIndexRef.current + 1);
    framesRef.current.push(ctx.getImageData(0, 0, element.width, element.height));
    frameIndexRef.current = framesRef.current.length - 1;
  };

  const restore = (index: number) => {
    const ctx = context();
    if (!ctx || index < 0 || index >= framesRef.current.length) return;
    ctx.putImageData(framesRef.current[index], 0, 0);
    frameIndexRef.current = index;
  };

  useEffect(() => {
    (async () => {
      try {
        const dataUrl = await getLocal<string>('annotateImage', '');
        if (!dataUrl) { setNotice('No screenshot found. Capture one from the Screenshot tool first.'); return; }
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        imageRef.current = image;
        const element = canvas();
        if (!element) return;
        element.width = image.naturalWidth;
        element.height = image.naturalHeight;
        context()?.drawImage(image, 0, 0);
        snapshot();
        setReady(true);
      } catch (error) { setNotice(String(error)); }
    })();
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width),
      y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height),
    };
  };

  const applyTool = (from: { x: number; y: number }, to: { x: number; y: number }, final: boolean) => {
    const ctx = context();
    if (!ctx) return;
    ctx.save();
    if (tool === 'free' || tool === 'highlight') {
      if (!final) return;
    }
    if (tool === 'arrow') {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.max(12, width * 4);
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    } else if (tool === 'rect') {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (tool === 'ellipse') {
      ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (tool === 'text') {
      ctx.fillStyle = color; ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.fillText(text, from.x, from.y);
    } else if (tool === 'blur') {
      ctx.filter = `blur(${Math.max(4, width * 3)}px)`;
      ctx.drawImage(canvas()!, from.x, from.y, Math.abs(to.x - from.x), Math.abs(to.y - from.y), from.x, from.y, Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      ctx.filter = 'none';
    }
    ctx.restore();
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready || tool === 'select') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    startRef.current = point(event);
    snapshot();
    if (tool === 'free' || tool === 'highlight') {
      const ctx = context()!;
      ctx.strokeStyle = tool === 'highlight' ? 'rgba(250,204,21,.45)' : color;
      ctx.lineWidth = tool === 'highlight' ? width * 6 : width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(startRef.current.x, startRef.current.y);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const current = point(event);
    if (tool === 'free' || tool === 'highlight') {
      const ctx = context()!;
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      return;
    }
    const index = frameIndexRef.current;
    restore(index);
    applyTool(startRef.current, current, false);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const end = point(event);
    if (tool !== 'free' && tool !== 'highlight') {
      restore(frameIndexRef.current);
      applyTool(startRef.current, end, true);
    }
  };

  const undo = () => { if (frameIndexRef.current > 0) restore(frameIndexRef.current - 1); };
  const redo = () => { if (frameIndexRef.current < framesRef.current.length - 1) restore(frameIndexRef.current + 1); };
  const reset = () => {
    const image = imageRef.current;
    if (!image) return;
    snapshot();
    context()?.drawImage(image, 0, 0);
  };

  return (
    <div className="editor-page">
      <ToolHeader
        title="Screenshot Editor"
        description="Annotate your capture, then download or copy it."
        actions={<Button variant="primary" icon={<Download size={14} />} onClick={() => canvas() && downloadDataUrl(canvas()!.toDataURL('image/png'), timestampName('annotated', 'png'))}>Download PNG</Button>}
      />
      <Notice tone="info">{notice}</Notice>
      <div className="editor-toolbar">
        <Segmented
          options={[
            { value: 'select', label: 'View' }, { value: 'free', label: 'Draw' },
            { value: 'arrow', label: 'Arrow' }, { value: 'rect', label: 'Box' },
            { value: 'ellipse', label: 'Ellipse' }, { value: 'text', label: 'Text' },
            { value: 'blur', label: 'Blur' }, { value: 'highlight', label: 'Highlight' },
          ]}
          value={tool}
          onChange={(next) => setTool(next as Tool)}
        />
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 38, padding: 2 }} title="Color" />
        <Input type="number" min={1} max={40} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 60 }} title="Stroke width" />
        {tool === 'text' && <Input value={text} onChange={(e) => setText(e.target.value)} style={{ width: 180 }} placeholder="Text" />}
        {tool === 'text' && <Input type="number" min={8} max={120} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={{ width: 64 }} title="Font size" />}
        <IconButton title="Undo" onClick={undo}><Undo2 size={16} /></IconButton>
        <IconButton title="Redo" onClick={redo}><Redo2 size={16} /></IconButton>
        <Button variant="ghost" onClick={reset} icon={<Eraser size={14} />}>Reset</Button>
      </div>
      <div className="editor-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="editor-canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ display: ready ? 'block' : 'none', cursor: tool === 'select' ? 'default' : 'crosshair' }}
        />
        {!ready && !notice && <span className="editor-hint">Loading screenshot…</span>}
      </div>
      <div className="editor-hint">Click and drag on the image. Use Undo to step back. Arrow, box, ellipse, text, blur, and highlight are available.</div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<AnnotatePage />);
