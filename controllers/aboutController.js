// Get about page
exports.getAbout = async (req, res) => {
  try {
    res.render('about', {
      title: 'About Us - Rent A Car'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading about page');
  }
};