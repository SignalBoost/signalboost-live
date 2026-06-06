import CanvasEditor from './CanvasEditor'

export default function VideoEditor() {
  const captions = [
    { text: 'Hello World', start: 0, end: 5, x: 50, y: 300, style: { fontSize: '24px', color: 'white', fontFamily: 'Arial' } }
  ]

  return <CanvasEditor videoSrc="/sample.mp4" captions={captions} />
}
