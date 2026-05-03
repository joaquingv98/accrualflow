import Hero from '../components/Hero';
import PainPoints from '../components/PainPoints';
import Workflow from '../components/Workflow';
import Modules from '../components/Modules';
import {
  RecommendedActionsSection,
  ClosingPackSection,
  ServiceOfferingSection,
} from '../components/LandingProductSections';
import DemoInterface from '../components/DemoInterface';
import BeforeAfter from '../components/BeforeAfter';
import CTA from '../components/CTA';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <PainPoints />
      <Workflow />
      <Modules />
      <RecommendedActionsSection />
      <ClosingPackSection />
      <ServiceOfferingSection />
      <DemoInterface />
      <BeforeAfter />
      <CTA />
    </>
  );
}
