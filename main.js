import { add } from 'lodash-es'

console.log(add(1, 3))

import { greet } from './test/test.ts'
console.log(greet('mini-vite'))

import './test/style.css'

import logo from './logo.png'
console.log('logo URL:', logo)
const img = document.createElement('img')
img.src = logo
img.alt = 'logo'
img.style.width = '100px'
document.body.appendChild(img)
