import { expect, test } from "@playwright/test";
import sharp from "sharp";

const testImage = () =>
  sharp({
    create: {
      width: 1000,
      height: 700,
      channels: 3,
      background: "#d9b38c",
    },
  })
    .png()
    .toBuffer();

test("dos jugadores comparten una sala y ven el mismo estado", async ({
  browser,
}) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();

  await pa.goto("/");
  await pa.getByPlaceholder("¿Cómo te llamás?").fill("Ana");
  await pa.locator('input[type="file"]').setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: await testImage(),
  });
  await pa.getByRole("button", { name: /Crear sala/ }).click();
  await expect(pa).toHaveURL(/\/room\//);

  await pb.goto(pa.url());
  await pb.getByPlaceholder("¿Cómo te llamás?").fill("Beto");
  await pb.getByRole("button", { name: /Entrar/ }).click();
  await expect(pa.getByText("Beto", { exact: true })).toBeVisible();
  await expect(pb.getByText("Ana", { exact: true })).toBeVisible();

  await pa.reload();
  await expect(pa.getByText(/colocadas/)).toBeVisible();
  await a.close();
  await b.close();
});

test("el tablero de 100 piezas se arrastra sin reconstruir todo el tablero", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByPlaceholder("¿Cómo te llamás?").fill("Dani");
  await page.locator('input[type="file"]').setInputFiles({
    name: "expert.png",
    mimeType: "image/png",
    buffer: await testImage(),
  });
  await page.getByRole("button", { name: /Experto/ }).click();
  await page.getByRole("button", { name: /Crear sala/ }).click();
  await expect(page).toHaveURL(/\/room\//);

  const pieces = page.locator(".piece");
  await expect(pieces).toHaveCount(100);
  const piece = pieces.last();
  const bounds = await piece.boundingBox();
  expect(bounds).not.toBeNull();

  const startX = bounds!.x + bounds!.width / 2;
  const startY = bounds!.y + bounds!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await expect(piece).toHaveClass(/moving/);
  await page.mouse.move(startX - 45, startY - 35, { steps: 20 });
  await expect(piece).toHaveAttribute("style", /transform: translate3d/);
  await page.mouse.up();
  await expect(piece).not.toHaveClass(/moving/);
  await expect(piece).not.toHaveAttribute("style", /transform: translate3d/);
});
