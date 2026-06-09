import { ContactForm } from "@/components/ContactForm";
import { brandLogos } from "@/lib/placeholder-data";
import {
  fetchRunPlayBackChannelStats,
  formatYouTubeCount,
} from "@/lib/youtube/channel-stats";

type PartnerContentProps = {
  error?: string;
  sent?: string;
};

export async function PartnerContent({ error, sent }: PartnerContentProps) {
  const stats = await fetchRunPlayBackChannelStats();
  const subscriberCount = formatYouTubeCount(stats.subscriberCount, "60,000");
  const viewCount = formatYouTubeCount(stats.viewCount, "8 million");

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Partner</span>
        </div>
        <iframe
          className="video-embed"
          src="https://www.youtube.com/embed/NmcinNAYpok"
          title="RunPlayBack partner video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        <div className="copy">
          <p>
            Welcome to RunPlayBack! We’ve got a loyal audience of{" "}
            <strong>{subscriberCount} subscribers</strong> and over{" "}
            <strong>{viewCount} views</strong> on our{" "}
            <a href="https://www.youtube.com/runplayback">
              <strong>YouTube channel</strong>
            </a>
            . We’ve worked with some incredible brands and welcome the opportunity
            to work with you. Simply submit the form below to get started. We look
            forward to hearing from you!
          </p>
        </div>

        <h2 className="section-title">Brands We’ve Worked With</h2>
        <div className="brand-grid">
          {brandLogos.map((brand) => (
            <div className="brand-logo" key={brand.name}>
              <img src={brand.image} alt={brand.name} />
            </div>
          ))}
        </div>

        <p className="section-title">
          Ready to work together? Fill out the form below to get started!
        </p>
        <ContactForm
          error={error}
          formContext="partner"
          redirectPath="/partner"
          sent={sent}
        />
      </div>
    </main>
  );
}
