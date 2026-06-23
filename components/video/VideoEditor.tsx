'use client'

import React, { useState } from 'react'
import CanvasEditor from './CanvasEditor'
import { supabase } from '@/lib/supabaseClient'
import { useTranslation } from '@/lib/i18n/useTranslation'

export default function VideoEditor() {
  const { t } = useTranslation()
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [captions, setCaptions] = useState<any[]>([])
  const [jobStatus, setJobStatus] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('videos')
      .upload(`raw/${file.name}`, file)

    if (error) {
      console.error(error)
      return
    }

    const publicUrl = supabase.storage.from('videos').getPublicUrl(`raw/${file.name}`).data.publicUrl
    setVideoSrc(publicUrl)

    // Create a transcoder job
    const { error: jobError } = await supabase.from('video_jobs').insert({
      source_video: publicUrl,
      job_type: 'export',
      status: 'queued'
    })

    if (jobError) {
      console.error(jobError)
    } else {
      setJobStatus('queued')
    }
  }

  async function pollJob() {
    const { data, error } = await supabase
      .from('video_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      console.error(error)
      return
    }

    const job = data?.[0]
    if (job) {
      setJobStatus(job.status)
      if (job.status === 'completed') {
        setDownloadUrl(job.result_url)
      }
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">{t('videoEditor.title', 'Video Editor')}</h1>

      <input type="file" accept="video/*" onChange={handleUpload} />

      {videoSrc && (
        <CanvasEditor videoSrc={videoSrc} captions={captions} />
      )}

      <div className="mt-4">
        <button
          onClick={pollJob}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {t('videoEditor.checkStatus', 'Check Job Status')}
        </button>
        {jobStatus && <p>{t('videoEditor.statusLabel', 'Status:')} {jobStatus}</p>}
        {downloadUrl && (
          <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 underline">
            {t('videoEditor.download', 'Download Exported Video')}
          </a>
        )}
      </div>
    </div>
  )
}
