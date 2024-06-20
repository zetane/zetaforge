import { useEffect } from 'react';
import { modalContentAtom } from "@/atoms/modalAtom";
import { Modal } from "@carbon/react";
import { useAtom } from "jotai";

export default function ClosableModal(props) {
  const [modalContent, setModalContent] = useAtom(modalContentAtom);
  const { children, modalClass, ...modalProps } = props;

  const closeModal = () => {
    setModalContent({
      ...modalContent.content,
      show: false,
    });
  };

  useEffect(() => {
    if (modalContent.show) {
      // Defocus the close button or any focused element within the modal immediately
      document.activeElement.blur();
    }
  }, [modalContent.show]);

  return (
    <Modal
      open={modalContent.show}
      onRequestClose={closeModal}
      className={modalClass}
      {...modalProps}
    >
      {children}
      
    </Modal>
  );
}
