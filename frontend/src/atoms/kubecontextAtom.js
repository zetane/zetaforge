import {atom} from 'jotai'

export const availableKubeContexts = atom([])
export const choosenKubeContexts = atom('')
export const isPackaged = atom(false)
export const runningKubeContext = atom('')
export const kubeErrorModalIsOpen = atom(false)
export const kubeErrors = atom([])
