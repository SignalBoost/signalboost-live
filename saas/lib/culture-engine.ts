// File: saas/lib/culture-engine.ts

export type CultureProfile = {
  language:string
  region:string
  communicationStyle:string
  tone:string
  websiteStyle:string
  audioStyle:string
  videoStyle:string
  salesStyle:string
}

export function getCultureProfile(
country?:string,
language?:string
):CultureProfile{

const c=
`${country || ''} ${language || ''}`
.toLowerCase()

/*
POLAND
*/

if(

c.includes('poland') ||
c.includes('polish') ||
c.includes('polski')

){

return{

language:'Polish',

region:'Poland',

communicationStyle:
'clear practical respectful',

tone:
'professional slightly formal',

websiteStyle:
'clean structured trust-focused',

audioStyle:
'calm natural professional',

videoStyle:
'less flashy more informative',

salesStyle:
'practical value-driven'

}

}

/*
BRAZIL
*/

if(

c.includes('brazil') ||
c.includes('brasil') ||
c.includes('portuguese')

){

return{

language:'Portuguese',

region:'Brazil',

communicationStyle:
'warm relationship-oriented',

tone:
'friendly energetic',

websiteStyle:
'vibrant engaging community-oriented',

audioStyle:
'warm expressive natural',

videoStyle:
'dynamic social-friendly',

salesStyle:
'relationship-first'

}

}

/*
RUSSIA
*/

if(

c.includes('russia') ||
c.includes('russian')

){

return{

language:'Russian',

region:'Russia',

communicationStyle:
'formal direct respectful',

tone:
'serious practical',

websiteStyle:
'clear structured authority-focused',

audioStyle:
'professional calm',

videoStyle:
'informative practical',

salesStyle:
'formal value-first'

}

}

/*
USA
*/

if(

c.includes('usa') ||
c.includes('united states') ||
c.includes('english')

){

return{

language:'English',

region:'USA',

communicationStyle:
'direct concise',

tone:
'friendly efficient',

websiteStyle:
'benefit-driven conversion-focused',

audioStyle:
'energetic natural',

videoStyle:
'fast engaging',

salesStyle:
'results-driven'

}

}

/*
DEFAULT
*/

return{

language:
language || 'Unknown',

region:
country || 'Global',

communicationStyle:
'respectful neutral',

tone:
'professional',

websiteStyle:
'clean modern',

audioStyle:
'natural',

videoStyle:
'balanced',

salesStyle:
'professional'

}

}
