// saas/app/api/video/upload/route.ts
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAccess } from '@/lib/auth/access'

export const runtime = 'nodejs'
export const maxDuration = 300

type SupportedVideoLocale = 'en' | 'es' | 'pt' | 'pl' | 'ru'

type JsonSafeVideoResponse<T> = {
  ok: boolean
  data: T | null
  error: string | null
  meta: { locale: SupportedVideoLocale; generatedAt: string }
}

const supportedLocales: SupportedVideoLocale[] = ['en', 'es', 'pt', 'pl', 'ru']
const maxUploadMb = 250
function json<T>(body: JsonSafeVideoResponse<T>, status = 200) { return NextResponse.json(body, { status }) }
function locale(value: FormDataEntryValue | null): SupportedVideoLocale {
  const requested = String(value || 'en')
  return supportedLocales.includes(requested as SupportedVideoLocale) ? requested as SupportedVideoLocale : 'en'
}
function safeFileName(name: string) { return String(name || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 140) }
function extensionFromName(name: string) { const match = name.match(/.([a-zA-Z0-9]+)$/); return match ? match[1].toLowerCase() : 'mp4' }
const VIDEO_TYPES: Readonly<Record<string,string>> = Object.freeze({ mp4:'video/mp4', m4v:'video/x-m4v', mov:'video/quicktime', webm:'video/webm' })
function videoContentType(fileName:string, declared:string):string|null {
 const expected=VIDEO_TYPES[extensionFromName(fileName)]; if(!expected)return null
 const type=String(declared||'').split(';',1)[0].trim().toLowerCase(); if(type&&!type.startsWith('video/'))return null; return expected
}
export async function POST(request: Request) {
 const access=await getAccess().catch(()=>null)
 if(!access?.userId) return json({ok:false,data:null,error:'You must be signed in to upload a video.',meta:{locale:'en',generatedAt:new Date().toISOString()}},401)
 const form=await request.formData(); const lang=locale(form.get('locale')); const video=form.get('video')
 if(!(video instanceof File)) return json({ok:false,data:null,error:'A video file is required.',meta:{locale:lang,generatedAt:new Date().toISOString()}},400)
 const contentType=videoContentType(video.name||'',video.type||'')
 if(!contentType) return json({ok:false,data:null,error:'Only MP4, M4V, MOV or WebM video files can be uploaded.',meta:{locale:lang,generatedAt:new Date().toISOString()}},415)
 const sizeMb=Number((video.size/1024/1024).toFixed(2))
 if(sizeMb>maxUploadMb) return json({ok:false,data:null,error:`Video upload limit is ${maxUploadMb} MB. Please upload a smaller file.`,meta:{locale:lang,generatedAt:new Date().toISOString()}},413)
 const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL; const serviceRoleKey=process.env.SUPABASE_SERVICE_ROLE_KEY; const bucket=process.env.VIDEO_STORAGE_BUCKET||'video-storage'
 if(!supabaseUrl||!serviceRoleKey) return json({ok:false,data:null,error:'Video storage is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.',meta:{locale:lang,generatedAt:new Date().toISOString()}},500)
 const supabase=createClient(supabaseUrl,serviceRoleKey,{auth:{persistSession:false}})
 const originalName=safeFileName(video.name||'source-video.mp4'); const ext=extensionFromName(originalName); const filename=`${randomUUID()}-${originalName.replace(/.[^.]+$/,'')}.${ext}`; const path=`uploads/${access.userId}/${new Date().toISOString().slice(0,10)}/${filename}`
 const {error:uploadError}=await supabase.storage.from(bucket).upload(path,video,{contentType,upsert:false})
 if(uploadError) return json({ok:false,data:null,error:'The video could not be stored. Please try again.',meta:{locale:lang,generatedAt:new Date().toISOString()}},500)
 const {data:publicData}=supabase.storage.from(bucket).getPublicUrl(path)
 return json({ok:true,data:{filename,originalName,path,bucket,publicUrl:publicData.publicUrl,sizeMb,contentType},error:null,meta:{locale:lang,generatedAt:new Date().toISOString()}})
}
