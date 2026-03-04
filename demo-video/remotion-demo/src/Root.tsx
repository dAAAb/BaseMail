import { Composition } from "remotion";
import { DiplomatDemo } from "./DiplomatDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DiplomatDemo"
        component={DiplomatDemo}
        durationInFrames={66 * 30} // ~66 seconds to match HeyGen narration
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
