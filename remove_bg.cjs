const { Jimp } = require('jimp');

Jimp.read('d:/mes/public/logo.jpg')
  .then(image => {
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];

      if (r > 240 && g > 240 && b > 240) {
        this.bitmap.data[idx + 3] = 0; 
      } else if (r > 200 && g > 200 && b > 200) {
        const alpha = Math.max(0, 255 - (r + g + b - 600) * 1.5);
        this.bitmap.data[idx + 3] = alpha;
      }
    });

    const size = Math.max(image.bitmap.width, image.bitmap.height);
    image.contain({ w: size, h: size });
    
    image.write('d:/mes/public/logo.png', () => {
      console.log('Ukończono! Logo jest kwadratowe.');
    });
  })
  .catch(console.error);
