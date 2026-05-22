
'use client'

import { useState } from 'react'

const GOLD='#ffc300'

export default function PodcastLaunchpad(){

const [topic,setTopic]=useState('')
const [experience,setExperience]=useState('beginner')

const ideas=[
'Technology & AI',
'Travel stories',
'Business',
'Sports',
'Health',
'True crime',
'Personal growth'
]

const generatedNames=[
'The Daily Signal',
'Beyond Tomorrow',
'Ideas Unfiltered',
'Next Horizon',
'Coffee & Conversations'
]

return(

<main
style={{
minHeight:'100vh',
padding:'40px 24px 80px',
background:
'radial-gradient(circle at top right, rgba(255,195,0,.12), transparent 25%),linear-gradient(180deg,#06070c,#0e1119)',
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
marginBottom:40
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
fontSize:12,
fontWeight:800,
marginBottom:20
}}
>

🎙️ PODCAST_LAUNCHPAD

</div>

<h1
style={{
fontSize:'clamp(38px,7vw,70px)',
lineHeight:1,
margin:0,
letterSpacing:'-.05em'
}}
>

Build your podcast
<br/>

<span
style={{
color:GOLD
}}
>
in 5 steps
</span>

</h1>

<p
style={{
marginTop:20,
fontSize:16,
lineHeight:1.7,
color:'rgba(255,255,255,.5)',
maxWidth:700
}}
>

Never created a podcast before?
No problem.
SignalBoost guides you through the process.

</p>

</div>

<div
style={{
display:'grid',
gridTemplateColumns:
'1fr 1fr',
gap:24
}}
>

<div
style={{
padding:25,
borderRadius:24,
background:'rgba(255,255,255,.03)',
border:'1px solid rgba(255,255,255,.08)'
}}
>

<h2>
Step 1
</h2>

<div
style={{
marginBottom:20
}}
>

<div
style={{
marginBottom:8
}}
>
Podcast topic
</div>

<input
value={topic}
onChange={e=>
setTopic(
e.target.value
)
}
placeholder='Example: Travel, AI, food...'
style={{
width:'100%',
padding:'14px',
borderRadius:14,
border:'none',
background:'rgba(255,255,255,.06)',
color:'#fff'
}}
/>

</div>

<div>

<div
style={{
marginBottom:8
}}
>
Experience level
</div>

<select
value={experience}
onChange={e=>
setExperience(
e.target.value
)
}
style={{
width:'100%',
padding:'14px',
borderRadius:14,
background:'rgba(255,255,255,.06)',
color:'#fff'
}}
>

<option value='beginner'>
Beginner
</option>

<option value='intermediate'>
Intermediate
</option>

<option value='advanced'>
Advanced
</option>

</select>

</div>

</div>

<div
style={{
padding:25,
borderRadius:24,
background:'rgba(255,255,255,.03)',
border:'1px solid rgba(255,255,255,.08)'
}}
>

<h2>
Podcast suggestions
</h2>

<div
style={{
display:'flex',
gap:10,
flexWrap:'wrap',
marginBottom:25
}}
>

{ideas.map(i=>(

<div
key={i}
style={{
padding:'8px 14px',
borderRadius:999,
background:
'rgba(255,195,0,.08)',
fontSize:13
}}
>

{i}

</div>

))}

</div>

<h3>
Possible podcast names
</h3>

<div
style={{
display:'grid',
gap:12
}}
>

{generatedNames.map(name=>(

<div
key={name}
style={{
padding:14,
borderRadius:14,
background:
'rgba(255,255,255,.05)'
}}
>

🎙️ {name}

</div>

))}

</div>

</div>

</div>

<div
style={{
marginTop:30
}}
>

<button
style={{
border:'none',
padding:'14px 28px',
borderRadius:999,
background:GOLD,
fontWeight:900,
cursor:'pointer'
}}
>

Continue →

</button>

</div>

</div>

</main>

)

}
