import Spline from "@splinetool/react-spline/next";

import HeroExperience from "./HeroExperience";

const SPLINE_SCENE = "https://prod.spline.design/7n8f5YWSgL4MSvLr/scene.splinecode";

export default function SplinePartnerHero() {
  return <HeroExperience splineScene={<Spline renderOnDemand={false} scene={SPLINE_SCENE} />} />;
}
