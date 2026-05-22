'use client'

const GOLD='#ffc300'

export default function PodcastStudioPage(){

return(

<main
style={{
minHeight:'100vh',
padding:'40px 24px',
background:
'linear-gradient(180deg,#050505,#10141f)',
color:'#fff'
}}
>

<div
style={{
maxWidth:1100,
margin:'0 auto'
}}
>

<div
style={{
display:'inline-flex',
padding:'6px 14px',
borderRadius:999,
background:'rgba(255,195,0,.1)',
border:'1px solid rgba(255,195,0,.2)',
color:GOLD,
fontWeight:800,
fontSize:12,
marginBottom:20
}}
>

🎙️ PODCAST_STUDIO

</div>

<h1
style={{
fontSize:'clamp(40px,7vw,70px)',
margin:0
}}
>
Podcast Studio
</h1>

<p
style={{
marginTop:20,
color:
'rgba(255,255,255,.6)',
lineHeight:1.7
}}
>
Upload audio, generate clips,
create transcripts and prepare distribution.
</p>

<div
style={{
display:'grid',
gridTemplateColumns:
'repeat(auto-fit,minmax(220px,1fr))',
gap:20,
marginTop:40
}}
>

{[
'📝 Transcript Agent',
'✂️ Clip Agent',
'🌍 Translation Agent',
'📣 Distribution Agent'
].map(item=>(

<div
key={item}
style={{
padding:24,
borderRadius:20,
background:
'rgba(255,255,255,.04)',
border:
'1px solid rgba(255,255,255,.08)'
}}
>

{item}

</div>

))}

</div>

</div>

</main>

)

}
