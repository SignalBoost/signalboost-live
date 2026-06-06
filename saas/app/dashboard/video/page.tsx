import PreviewLimitGuard from '@/components/video/PreviewLimitGuard'
import VideoEditor from '@/components/video/VideoEditor'

export default function VideoPage() {
  return (
    <>
      <PreviewLimitGuard limit={3} enabled />
      <VideoEditor />
    </>
  )
}
