import React from "react";
import { Outlet } from "react-router-dom";
import SiteHeader from "@/components/SiteHeader";
import DemoBanner from "@/components/DemoBanner";

export default function Layout() {
  return (
    <>
      <DemoBanner />
      <SiteHeader />
      <Outlet />
    </>
  );
}