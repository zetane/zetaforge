import { isPackaged } from "@/atoms/kubecontextAtom";
import { Modal } from "@carbon/react";
import KubecontextModal from "./KubecontextModal";
import { useState, useEffect } from "react";
import { useAtom } from 'jotai'
import ClosableModal from "./ClosableModal";
import { choosenKubeContexts, availableKubeContexts, runningKubeContext, kubeErrors} from '@/atoms/kubecontextAtom'
import { defaultAnvilConfigurationAtom } from "@/atoms/anvilConfigurationsAtom";
import axios from 'axios'


export default function InitialLaunchModal() {
    const [appIsPackaged, setIsPackaged] = useAtom(isPackaged)
    const [open, setOpen] = useState(true)
    const [errOpen, setErrOpen] = useState(false)
    const [availableKubeContextsAtom, setAvailableKubeContexts] = useAtom(availableKubeContexts)
    const [currentRunningKubeContext]= useAtom(runningKubeContext)
    const serverAddress = import.meta.env.VITE_EXPRESS
    const [errMessage, setErrMessage] = useState([])
    const [defaultConfig] = useAtom(defaultAnvilConfigurationAtom)
    
    const closeModal = () => {
        axios.get(`http://${defaultConfig.host}:${defaultConfig.anvilPort}/ping`).then((res) => {
            setOpen(false)
        }).catch(err => {
            const errMessage = ["Can't ping anvil. Please re-try"]
            setErrMessage(errMessage)
            setOpen(true)
            setErrOpen(true)
        })
    }

    useEffect(() => {
        
        if(availableKubeContextsAtom.length === 0) {
            axios.get(`${serverAddress}/get-kube-contexts`).then((res) => {
                setAvailableKubeContexts(res.data)
            }
            ).catch(err => {
                console.log('This should not throw err.')
            })
        }
        const checkPing = async () => {
            try {
                const res = await axios.get(`http://${defaultConfig.host}:${defaultConfig.anvilPort}/ping`)
                if(res.status === 200) {
                    console.log("ALREADY PINGING ANVIL")
                    // setOpen(false)
                    return true
                } else {
                    console.log("PING FAILEDDD1111")
                    return false
                }

            } catch(err) {
                console.log("PING FAILEDDD222")
                return false
            }
        }
        
        checkPing().then((res) => {
            if(res == true) {
                setOpen(false)
            } else{
                axios.post(`${serverAddress}/initial-anvil-launch`).then((anvilResponse) => {
                    if(anvilResponse.status === 200){
                        setOpen(false)
                    } else {
                        console.log("CHECK IF KUBEERROR HAPPENS HERE??")
                        setOpen(true)
                    }
                }).catch((err) => {
                    console.log("CHECK IF KUBEERROR HAPPENS HERE222")
                    console.log(err)
                    setOpen(true)
                })
            }
            
        })

    }, [])

    if(appIsPackaged === false) {
        console.log("U SHOULDNt be hereeeeee")
        return <></>
    }

    return (
    <>
    <Modal modalHeading="Please select a kubecontext" passiveModal open={open} onRequestClose={closeModal}>
        <KubecontextModal isPackaged={true} initialLaunch={true} />
    </Modal>

<ClosableModal
modalHeading="The following error(s) occurred:"
passiveModal={true}
open={errOpen}
onRequestClose={() => setErrOpen(false)}
>
<div className="flex flex-col gap-4 p-3">
  {errMessage.map((error, i) => {
    return (
      <p key={"error-msg-" + i}>{error}</p>
    )
  })}
</div>
</ClosableModal>
</>)
}