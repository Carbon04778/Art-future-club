import React from 'react';
import VerticalMetadata from '@/components/VerticalMetadata';
import GlobalNexus from '@/components/GlobalNexus';
import CityChapters from '@/components/CityChapters';
import EditorialArchive from '@/components/EditorialArchive';
import CollectiveRegistry from '@/components/CollectiveRegistry';
import ManifestoFooter from '@/components/ManifestoFooter';
import TrendingSection from '@/components/TrendingSection';

const HERO_IMAGE = '/images/AdobeStock_528827486.jpg';
const PORTRAIT_1 = '/images/LandingpageJulieinterveiw.png';
const PORTRAIT_2 = '/images/generated_ea6edfdc.png';
const DETAIL = '/images/LandingpageJulieinterveiw.png';

export default function Home() {
  return (
    <>
      <VerticalMetadata
        leftText="Art Future Club — Global Community"
        rightText="MMXXVI · Radical Connectivity"
      />
      <GlobalNexus heroImage={HERO_IMAGE} />
      <CityChapters />
      <EditorialArchive
        portrait1={PORTRAIT_1}
        portrait2={PORTRAIT_2}
        detail={DETAIL}
      />
      <TrendingSection />
      <CollectiveRegistry />
      <ManifestoFooter />
    </>
  );
}