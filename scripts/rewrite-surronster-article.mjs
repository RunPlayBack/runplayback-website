import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const targetSlug = "sur-ronster-ev-creator-setup-house-tour-interview-LgT-UDVmYdI";

function loadEnv() {
  if (!fs.existsSync(".env.local")) {
    return;
  }

  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const index = line.indexOf("=");

    if (!line || line.startsWith("#") || index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(key) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required in .env.local.`);
  }

  return value;
}

loadEnv();

const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      persistSession: false,
    },
  },
);

const title =
  "Visiting Surronster: House Tour, Creator Setup, and the Story Behind One of YouTube's Biggest EV Channels";
const seoDescription =
  "I visited Surronster at home to tour his house, see his creator setup, and talk about how he built one of YouTube's biggest EV channels.";

const content = `When people think of electric bike content on YouTube, one name almost always comes up: Surronster.

Over the years, I've watched his channel grow from simple riding videos into one of the most recognizable brands in the electric mobility space. So when I had the opportunity to visit him at home, I wanted to do more than just look at bikes. I wanted to understand the person behind the channel, see how he works, and learn what it actually takes to build a career around electric vehicles.

As soon as I arrived, it was obvious that this wasn't just a hobby anymore. Every part of the property reflected years of dedication to content creation, riding, testing, and building a community around electric mobility. From the bike collection to the filming setup, everything had a purpose.

From Math Teacher to Full-Time Creator

One of the most interesting parts of our conversation was learning about Surronster's path before YouTube.

Like many creators, he didn't start with the goal of becoming an internet personality. His background was actually far removed from the world of electric bikes. What stood out to me was how his analytical mindset helped shape the way he approaches content today. Instead of chasing trends, he focused on consistency, learning, and serving a community that was growing alongside him.

That approach helped him build trust with viewers and eventually turn a passion project into a full-time career.

The House Tour

Naturally, I had to check out the setup.

What impressed me wasn't the size of the collection—it was how organized everything was. Every bike seemed to tell a story. Some represented milestones for the channel, others were platforms for testing new parts and upgrades, and a few were simply machines he genuinely enjoyed riding.

Walking through the space gave me a better understanding of why his content feels authentic. These aren't products that show up for a quick review and disappear. Many of these bikes have been ridden, modified, crashed, repaired, and ridden again.

That's the kind of experience viewers can immediately recognize.

Behind the Camera

One thing I was especially curious about was his production workflow.

As creators, it's easy to assume that bigger channels have massive teams behind them. In reality, a lot of the work still comes down to planning, filming, editing, and problem-solving. We talked about cameras, content strategy, uploading schedules, and how he balances creating videos while still making time to actually ride.

It's a reminder that successful creators spend just as much time working on the business side of content as they do producing videos.

Building a Community, Not Just a Channel

Throughout the interview, one theme kept coming up: community.

Whether it's group rides, collaborations, helping new riders, or simply answering questions from viewers, Surronster has built something larger than a YouTube channel. He's helped create a space where people can share their enthusiasm for electric mobility and learn from one another.

That community-first mindset is probably one of the biggest reasons his audience continues to grow.

Final Thoughts

After spending time with Surronster, I walked away with a deeper appreciation for what he's built.

It's easy to look at subscriber counts and viral videos and assume success happened overnight. But seeing the operation up close revealed years of work, experimentation, and persistence behind the scenes.

Whether you're a fan of electric bikes, content creation, or entrepreneurship, there's a lot to learn from his journey. And if nothing else, it's proof that a genuine passion combined with consistency can turn a niche interest into something much bigger than anyone originally imagined.`;

const { data: article, error: findError } = await supabase
  .from("articles")
  .select("id,slug")
  .eq("slug", targetSlug)
  .single();

if (findError || !article) {
  throw findError || new Error("Article not found.");
}

const { error } = await supabase
  .from("articles")
  .update({
    content,
    seo_description: seoDescription,
    seo_title: title,
    title,
    updated_at: new Date().toISOString(),
  })
  .eq("id", article.id);

if (error) {
  throw error;
}

console.log(`Updated article: ${targetSlug}`);
