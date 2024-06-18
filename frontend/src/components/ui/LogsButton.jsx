import { PipelineLogs } from "./PipelineLogs";
import { Button } from "@carbon/react";
import { CloudLogging } from "@carbon/icons-react";
import { useAtom } from "jotai";
import { modalContentAtom } from "@/atoms/modalAtom";

export default function LogsButton() {
  const [modalContent, setModalContent] = useAtom(modalContentAtom);

  const modalPopper = (content) => {
    setModalContent({
      ...modalContent,
      show: true,
      content: content,
    });
  };

  const styles = {
    margin: '5px',
  };

  const svgOverride = { position: 'absolute', right: '15px', top: '5px'}
  return (
    <Button style={styles} size="sm" kind="secondary" onClick={() => modalPopper(<PipelineLogs />)}>
      Log
      <CloudLogging size="20" style={svgOverride} />
    </Button>
  )
}
