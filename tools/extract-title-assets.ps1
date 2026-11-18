param(
  [string]$AssetSheet = "$env:USERPROFILE\Downloads\Festive Snowman Game Menu Asset Sheet.png",
  [string]$TitleArt = "$env:USERPROFILE\Downloads\The Greatest Snowman_ Christmas Adventure.png",
  [string]$OutputDirectory = "$PSScriptRoot\..\client\public\assets\title"
)

Add-Type -AssemblyName System.Drawing
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class SnowmanTitleAssets {
  public static void Crop(string sourcePath, string outputPath, int x, int y, int width, int height, bool keyBackground) {
    using (var source = new Bitmap(sourcePath))
    using (var crop = new Bitmap(width, height, PixelFormat.Format32bppArgb))
    using (var graphics = Graphics.FromImage(crop)) {
      graphics.DrawImage(source, new Rectangle(0, 0, width, height), new Rectangle(x, y, width, height), GraphicsUnit.Pixel);
      if (keyBackground) MakeConnectedCheckerboardTransparent(crop);
      crop.Save(outputPath, ImageFormat.Png);
    }
  }

  public static void CropJpeg(string sourcePath, string outputPath, int x, int y, int width, int height, long quality) {
    using (var source = new Bitmap(sourcePath))
    using (var crop = new Bitmap(width, height, PixelFormat.Format24bppRgb))
    using (var graphics = Graphics.FromImage(crop)) {
      graphics.Clear(Color.Black);
      graphics.DrawImage(source, new Rectangle(0, 0, width, height), new Rectangle(x, y, width, height), GraphicsUnit.Pixel);
      SaveJpeg(crop, outputPath, quality);
    }
  }

  public static void SaveJpeg(Bitmap image, string outputPath, long quality) {
    var encoder = Array.Find(ImageCodecInfo.GetImageEncoders(), item => item.MimeType == "image/jpeg");
    using (var parameters = new EncoderParameters(1)) {
      parameters.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
      image.Save(outputPath, encoder, parameters);
    }
  }

  private static bool IsCheckerboard(Color c) {
    int max = Math.Max(c.R, Math.Max(c.G, c.B));
    int min = Math.Min(c.R, Math.Min(c.G, c.B));
    return min >= 145 && max - min <= 34;
  }

  private static void MakeConnectedCheckerboardTransparent(Bitmap bitmap) {
    int width = bitmap.Width, height = bitmap.Height;
    var visited = new bool[width * height];
    var queue = new Queue<int>();
    Action<int> add = index => {
      if (visited[index]) return;
      visited[index] = true;
      int x = index % width, y = index / width;
      if (IsCheckerboard(bitmap.GetPixel(x, y))) queue.Enqueue(index);
    };
    for (int x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (int y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
    while (queue.Count > 0) {
      int index = queue.Dequeue();
      int x = index % width, y = index / width;
      bitmap.SetPixel(x, y, Color.FromArgb(0, 0, 0, 0));
      if (x > 0) add(index - 1);
      if (x + 1 < width) add(index + 1);
      if (y > 0) add(index - width);
      if (y + 1 < height) add(index + width);
    }
  }
}
'@

$sheet = [IO.Path]::GetFullPath($AssetSheet)
[SnowmanTitleAssets]::CropJpeg($sheet, (Join-Path $output 'bg.jpg'), 2, 2, 972, 530, 88)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'logo.png'), 985, 38, 680, 470, $true)
[SnowmanTitleAssets]::CropJpeg([IO.Path]::GetFullPath($TitleArt), (Join-Path $output 'title-art.jpg'), 0, 0, 1672, 941, 88)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'play.png'), 80, 535, 460, 180, $true)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'play-hover.png'), 600, 535, 460, 180, $true)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'play-pressed.png'), 1120, 535, 460, 180, $true)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'quit.png'), 80, 735, 460, 190, $true)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'quit-hover.png'), 600, 735, 460, 190, $true)
[SnowmanTitleAssets]::Crop($sheet, (Join-Path $output 'quit-pressed.png'), 1120, 735, 460, 190, $true)
Write-Output "Title assets extracted to $output"
