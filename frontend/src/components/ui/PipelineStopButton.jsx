import { useMutation } from "@tanstack/react-query";
import { Stop } from "@carbon/icons-react";
import { Button } from "@carbon/react";
import axios from "axios";
import { useState } from "react";

export const PipelineStopButton = ({executionId, configuration}) => {
  const [isTerminating, setIsTerminating] = useState(false)
  const terminate = useMutation({
    mutationFn: async () => {
      const url = `http://${configuration.host}:${configuration.anvilPort}/execution/${executionId}/terminate`
      const res = axios.post(url)
      return res.data
    },
    onSuccess: (res) => {
      // Hasta la vista, baby
      setIsTerminating(true)
    }
  })

  const mutationAction = () => {
    terminate?.mutateAsync()
  }

  const svgOverride = { position: 'absolute', right: '15px', top: '5px'}
  const buttonStyles = { margin: '5px' }

  let stopButton = (<div>
      Stop
      <Stop size="20" style={svgOverride} />
    </div>)

  if (isTerminating) {
    stopButton = (<div>
      Stopping
      <Stop size="20" style={svgOverride} />
    </div>)
  }

  const disabled = (isTerminating || !executionId)

  return (
    <Button size="sm" style={buttonStyles} disabled={disabled} onClick={() => mutationAction()}>
      { stopButton }
    </Button>
  )
}
