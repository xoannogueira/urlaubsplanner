using Urlaubsplanner.Api.Desktop;

namespace Urlaubsplanner.Tests.Desktop;

public sealed class PdfExportTests
{
    [Theory]
    [InlineData("Portugal-Rundreise", "Reiseplan Portugal-Rundreise.pdf")]
    [InlineData("Japan: Tokio / Kyoto?", "Reiseplan Japan Tokio Kyoto.pdf")]
    [InlineData("  ...  ", "Reiseplan Reise.pdf")]
    public void Dateiname_ist_auf_allen_Systemen_gueltig(string title, string expected)
    {
        Assert.Equal(expected, PdfExport.FileName(title));
    }

    [Fact]
    public void Neue_Fassung_ersetzt_die_alte()
    {
        var folder = Directory.CreateTempSubdirectory().FullName;
        var first = PdfExport.Write(folder, "Reiseplan X.pdf", "%PDF-1"u8.ToArray());
        var second = PdfExport.Write(folder, "Reiseplan X.pdf", "%PDF-2"u8.ToArray());

        Assert.Equal(first, second);
        Assert.Single(Directory.GetFiles(folder));
        Assert.Equal("%PDF-2", File.ReadAllText(second));
    }
}
