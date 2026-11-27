// UPLOAD EQUIPMENT IMAGE TO IMGBB
export async function uploadImage(req, res) {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).send({ message: "Image is required" });
    }

    const base64Image = image.includes(",") ? image.split(",")[1] : image;

    const formData = new FormData();
    formData.append("image", base64Image);

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
      {
        method: "POST",
        body: formData,
      },
    );

    const data = await response.json();

    if (!data.success) {
      return res.status(500).send({ message: "Image upload failed" });
    }

    res.send({ url: data.data.url });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
}
