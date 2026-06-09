import { ContactForm } from "@/components/ContactForm";

type ContactPageProps = {
  searchParams?: Promise<{
    error?: string;
    sent?: string;
  }>;
};

export default async function ContactPage({ searchParams }: ContactPageProps) {
  const resolvedSearchParams = await searchParams;

  return (
    <main className="page">
      <div className="legacy-page">
        <div className="page-kicker">
          <span>Contact</span>
        </div>
        <iframe
          className="video-embed"
          src="https://www.youtube.com/embed/Y1g2yW087ww?feature=oembed"
          title="Riding on a Budget: Tuttio Soleil 01 Electric Mini Bike Deep Dive Review!"
          allowFullScreen
        />
        <div className="copy">
          <p>
            We give DIVERSE recommendations on how to use electric vehicle tech
            for a more efficient and affordable lifestyle. Let’s save money
            together!
          </p>
          <p>
            All of the content we create is made for FREE. So if you find any of
            it helpful please support this site by visiting our{" "}
            <a
              href="https://www.amazon.com/shop/runplayback/list/5GB0973NVXMR"
              rel="noopener noreferrer"
              target="_blank"
            >
              <strong>Amazon Shop</strong>
            </a>
            . By using these links it helps us earn a few pennies along the way
            to keep everything running. Thanks!
          </p>
        </div>
        <a
          className="amazon-card"
          href="https://www.amazon.com/shop/runplayback/list/5GB0973NVXMR"
          rel="noopener noreferrer"
          target="_blank"
        >
          <img
            src="https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1578788440774-NH5ROFBJU669U132YYE5/amazon.png?format=1000w"
            alt="Here's ALL My Camera Gear and Movies"
          />
        </a>
        <h2 className="section-title">
          We’d love to hear from you. Please send a message. Thanks!
        </h2>
        <ContactForm
          error={resolvedSearchParams?.error}
          formContext="contact"
          redirectPath="/contact"
          sent={resolvedSearchParams?.sent}
        />
      </div>
    </main>
  );
}
