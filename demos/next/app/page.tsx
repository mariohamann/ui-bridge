import AppNav from '../components/AppNav';
import HeroSection from '../components/HeroSection';
import FeaturesSection from '../components/FeaturesSection';
import CtaSection from '../components/CtaSection';
import AppFooter from '../components/AppFooter';

export default function Home() {
  return (
    <>
      <AppNav />
      <main>
        <HeroSection />
        <FeaturesSection />
        <CtaSection />
      </main>
      <AppFooter />
    </>
  );
}
