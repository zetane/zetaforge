import { trpc } from '@/utils/trpc';
import { Information } from "@carbon/icons-react";
import { Tile, Tooltip } from '@carbon/react';

const usePipelineCoverImagePath = (pipelineId) => {
  const { data, isLoading, error } = trpc.getPipelineCoverImagePath.useQuery({ pipelineId });

  return {
    coverImagePath: data?.coverImagePath,
    isLoading,
    error,
  };
};

const dragStartHandlerPipeline = (event, pipeline) => {
  let pipelineData = JSON.stringify(pipeline);
  event.dataTransfer.setData("pipeline", pipelineData);
};


export const LibraryPipelineTile = ({ pipeline, index }) => {
  const pipelineId = pipeline.id;
  const pipelineName = pipeline.name;
  const pipelineDescription = pipeline.description;
  const backgroundColor = 'var(--pipeline-background-color)';

  // Use the custom hook to fetch the cover image path
  const { coverImagePath, isLoading } = usePipelineCoverImagePath(pipelineId);

  const handleImageError = (e) => {
    e.target.style.display = 'none'; // Hide the image if it fails to load
  };

  return (
    <Tile className="library-tile relative"
      key={index}
      draggable={true}
      onDragStart={(ev) => { dragStartHandlerPipeline(ev, pipeline) }}>
      <div className="library-header" title={pipelineName} style={{ backgroundColor: backgroundColor }}>
        {pipelineName}
      </div>
      <div className="h-[128px] relative overflow-hidden image-container">
        {isLoading ? (
          <div className="flex justify-center items-center h-full"></div>
        ) : (
          <img src={coverImagePath} alt={pipelineName} className="object-contain w-full h-full absolute top-0 left-0" style={{ zIndex: 0, opacity: 1.0 }} onError={handleImageError} />
        )}
      </div>
      <div className="absolute bottom-1 left-2 z-10">
        <Tooltip
          align="bottom-left"
          label={pipelineDescription}>
          <Information size={20} />
        </Tooltip>
      </div>
    </Tile>
  );
};

export default LibraryPipelineTile;
